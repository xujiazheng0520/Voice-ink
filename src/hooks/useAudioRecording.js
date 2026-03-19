import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AudioManager from "../helpers/audioManager";
import logger from "../utils/logger";
import { playStartCue, playStopCue } from "../utils/dictationCues";
import { getSettings } from "../stores/settingsStore";
import { getRecordingErrorTitle } from "../utils/recordingErrors";

const STOP_CUE_UNMUTE_SETTLE_MS = 120;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const useAudioRecording = (toast, options = {}) => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [pasteFallback, setPasteFallback] = useState({
    open: false,
    text: "",
    mode: null,
    message: "",
  });
  const audioManagerRef = useRef(null);
  const startLockRef = useRef(false);
  const stopLockRef = useRef(false);
  const { onToggle } = options;

  const clearPasteFallback = useCallback(() => {
    setPasteFallback({ open: false, text: "", mode: null, message: "" });
  }, []);

  const performStartRecording = useCallback(async () => {
    if (startLockRef.current) return false;
    startLockRef.current = true;
    try {
      if (!audioManagerRef.current) return false;

      const currentState = audioManagerRef.current.getState();
      if (currentState.isRecording || currentState.isProcessing) return false;

      // [TIP]: 录音时自动获取用户选中文本功能，暂时不做
      // Best-effort: capture what's selected in the focused external app.
      // This intentionally runs before acquiring the microphone.
      // try {
      //   const selectionResult = await window.electronAPI?.copySelectedTextAndReadClipboard?.();
      //   const captured = selectionResult?.success ? selectionResult.text : "";
      //   setSelectedText(captured);
      //   if (audioManagerRef.current) {
      //     audioManagerRef.current.preRecordingSelectedText = captured;
      //   }

      //   const maxLogLen = 2000;
      //   const safeLogText =
      //     typeof captured === "string" && captured.length > maxLogLen
      //       ? `${captured.slice(0, maxLogLen)}... (truncated)`
      //       : captured;

      //   logger.debug(
      //     "Pre-recording selection captured",
      //     {
      //       hasSelection: !!captured,
      //       selectionLength: captured?.length || 0,
      //       selectedText: safeLogText,
      //     },
      //     "clipboard"
      //   );
      // } catch (err) {
      //   setSelectedText("");
      //   if (audioManagerRef.current) {
      //     audioManagerRef.current.preRecordingSelectedText = "";
      //   }
      //   logger.debug(
      //     "Pre-recording selection capture failed (non-fatal)",
      //     { error: err?.message || String(err) },
      //     "clipboard"
      //   );
      // }

      const didStart = audioManagerRef.current.shouldUseStreaming()
        ? await audioManagerRef.current.startStreamingRecording()
        : await audioManagerRef.current.startRecording();

      if (didStart) {
        void playStartCue();
      }

      return didStart;
    } finally {
      startLockRef.current = false;
    }
  }, []);

  const performStopRecording = useCallback(async () => {
    if (stopLockRef.current) return false;
    stopLockRef.current = true;
    try {
      if (!audioManagerRef.current) return false;

      const currentState = audioManagerRef.current.getState();
      if (!currentState.isRecording && !currentState.isStreamingStartInProgress) return false;

      if (currentState.isStreaming || currentState.isStreamingStartInProgress) {
        await audioManagerRef.current.releaseRecordingOutputMute();
        await wait(STOP_CUE_UNMUTE_SETTLE_MS);
        void playStopCue();
        return await audioManagerRef.current.stopStreamingRecording();
      }

      await audioManagerRef.current.releaseRecordingOutputMute();
      await wait(STOP_CUE_UNMUTE_SETTLE_MS);
      const didStop = audioManagerRef.current.stopRecording();

      if (didStop) {
        void playStopCue();
        setSelectedText("");
      }

      return didStop;
    } finally {
      stopLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    audioManagerRef.current = new AudioManager();

    audioManagerRef.current.setCallbacks({
      onStateChange: ({ isRecording, isProcessing, isStreaming }) => {
        setIsRecording(isRecording);
        setIsProcessing(isProcessing);
        setIsStreaming(isStreaming ?? false);
        if (isRecording) {
          clearPasteFallback();
        }
        if (!isStreaming) {
          setPartialTranscript("");
        }
      },
      onError: (error) => {
        const title = getRecordingErrorTitle(error, t);
        toast({
          title,
          description: error.description,
          variant: "destructive",
          duration: error.code === "AUTH_EXPIRED" ? 8000 : undefined,
        });
      },
      onPartialTranscript: (text) => {
        setPartialTranscript(text);
      },
      onTranscriptionComplete: async (result) => {
        if (result.success) {
          const transcribedText = result.text?.trim();

          // 打印转录完成回调日志
          logger.info(
            "onTranscriptionComplete callback triggered",
            {
              hasText: !!transcribedText,
              textLength: transcribedText?.length || 0,
              source: result.source,
              text: transcribedText,
            },
            "transcription"
          );

          if (!transcribedText) {
            return;
          }

          setTranscript(result.text);

          const isStreaming = result.source?.includes("streaming");
          const pasteStart = performance.now();
          const pasteResult = await audioManagerRef.current.safePaste(
            result.text,
            isStreaming ? { fromStreaming: true } : {}
          );
          const pasteMode = pasteResult?.mode || (pasteResult?.success ? "pasted" : "failed");

          // 打印粘贴结果日志
          logger.info(
            "Text paste completed",
            {
              pasteMode,
              success: pasteResult?.success,
              textLength: result.text.length,
              pasteTimeMs: Math.round(performance.now() - pasteStart),
            },
            "transcription"
          );

          if (pasteMode === "copied" || pasteMode === "failed") {
            window.electronAPI?.showDictationPanel?.();
            setPasteFallback({
              open: true,
              text: result.text,
              mode: pasteMode,
              message: pasteResult?.message || "",
            });
          }

          logger.info(
            "Paste timing",
            {
              pasteMs: Math.round(performance.now() - pasteStart),
              source: result.source,
              textLength: result.text.length,
              mode: pasteMode,
              reason: pasteResult?.reason,
            },
            "streaming"
          );

          audioManagerRef.current.saveTranscription(result.text);

          if (result.source === "openai" && getSettings().useLocalWhisper) {
            toast({
              title: t("hooks.audioRecording.fallback.title"),
              description: t("hooks.audioRecording.fallback.description"),
              variant: "default",
            });
          }

          // Cloud usage: limit reached after this transcription
          if (result.source === "openwhispr" && result.limitReached) {
            // Notify control panel to show UpgradePrompt dialog
            window.electronAPI?.notifyLimitReached?.({
              wordsUsed: result.wordsUsed,
              limit:
                result.wordsRemaining !== undefined
                  ? result.wordsUsed + result.wordsRemaining
                  : 2000,
            });
          }

          if (audioManagerRef.current.sttConfig?.dictation?.mode === "streaming") {
            audioManagerRef.current.warmupStreamingConnection();
          }
        }
      },
    });

    audioManagerRef.current.setContext("dictation");
    window.electronAPI.getSttConfig?.().then((config) => {
      if (config && audioManagerRef.current) {
        audioManagerRef.current.setSttConfig(config);
        if (config.dictation?.mode === "streaming") {
          audioManagerRef.current.warmupStreamingConnection();
        }
      }
    });

    const handleToggle = async () => {
      if (!audioManagerRef.current) return;
      const currentState = audioManagerRef.current.getState();

      if (!currentState.isRecording && !currentState.isProcessing) {
        await performStartRecording();
      } else if (currentState.isRecording) {
        await performStopRecording();
      }
    };

    const handleStart = async () => {
      await performStartRecording();
    };

    const handleStop = async () => {
      await performStopRecording();
    };

    const disposeToggle = window.electronAPI.onToggleDictation(() => {
      handleToggle();
      onToggle?.();
    });

    const disposeStart = window.electronAPI.onStartDictation?.(() => {
      handleStart();
      onToggle?.();
    });

    const disposeStop = window.electronAPI.onStopDictation?.(() => {
      handleStop();
      onToggle?.();
    });

    const handleNoAudioDetected = () => {
      toast({
        title: t("hooks.audioRecording.noAudio.title"),
        description: t("hooks.audioRecording.noAudio.description"),
        variant: "default",
      });
    };

    const disposeNoAudio = window.electronAPI.onNoAudioDetected?.(handleNoAudioDetected);

    // Cleanup
    return () => {
      disposeToggle?.();
      disposeStart?.();
      disposeStop?.();
      disposeNoAudio?.();
      if (audioManagerRef.current) {
        audioManagerRef.current.cleanup();
      }
    };
  }, [toast, onToggle, performStartRecording, performStopRecording, t, clearPasteFallback]);

  const startRecording = async () => {
    return performStartRecording();
  };

  const stopRecording = async () => {
    return performStopRecording();
  };

  const cancelRecording = async () => {
    if (audioManagerRef.current) {
      const state = audioManagerRef.current.getState();
      if (state.isStreaming) {
        const res = await audioManagerRef.current.stopStreamingRecording();
        setSelectedText("");
        return res;
      }
      const res = audioManagerRef.current.cancelRecording();
      setSelectedText("");
      return res;
    }
    return false;
  };

  const cancelProcessing = () => {
    if (audioManagerRef.current) {
      return audioManagerRef.current.cancelProcessing();
    }
    return false;
  };

  const toggleListening = async () => {
    if (!isRecording && !isProcessing) {
      await startRecording();
    } else if (isRecording) {
      await stopRecording();
    }
  };

  return {
    isRecording,
    isProcessing,
    isStreaming,
    transcript,
    partialTranscript,
    selectedText,
    pasteFallback,
    clearPasteFallback,
    startRecording,
    stopRecording,
    cancelRecording,
    cancelProcessing,
    toggleListening,
  };
};
