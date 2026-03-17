
/**
 * ArkAnalysisService - 使用火山引擎 Ark API 进行文案分析
 * 维护大模型分析能力，返回大模型给出的答案
 * 直接实现 Ark API 调用，不依赖其他服务
 */
class ArkAnalysisService {
  static ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
  static ARK_MODEL = "minimax-m2.5";

  /**
   * 分析文案 - 调用大模型进行深度分析
   * @param {string} text - 要分析的文案
   * @param {string} [analysisPrompt] - 自定义分析提示词（可选）
   * @param {string} [apiKey] - Ark API 密钥（可选，如果不提供则从环境变量读取）
   * @returns {Promise<{success: boolean, originalText: string, analysis: string, error?: string, timestamp: number, processingTimeMs: number}>}
   */
  async analyzeText(text, analysisPrompt, apiKey) {
    const startTime = Date.now();

    if (!text?.trim()) {
      return {
        success: false,
        originalText: text || "",
        analysis: "",
        error: "Text cannot be empty",
        timestamp: Date.now(),
        processingTimeMs: 0,
      };
    }

    // 从参数或环境变量获取 API 密钥
    const arkApiKey = apiKey || process.env.ARK_API_KEY || "";
    if (!arkApiKey?.trim()) {
      return {
        success: false,
        originalText: text,
        analysis: "",
        error: "Ark API key not configured. Please provide apiKey parameter or set ARK_API_KEY environment variable.",
        timestamp: Date.now(),
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      console.log("[ARK_ANALYSIS_START]", {
        textLength: text.length,
        hasCustomPrompt: !!analysisPrompt,
      });

      const systemPrompt = analysisPrompt || this.getDefaultAnalysisPrompt();
      const result = await this.callArkApi(text, systemPrompt, arkApiKey);
      const processingTimeMs = Date.now() - startTime;

      console.log("[ARK_ANALYSIS_SUCCESS]", {
        originalLength: text.length,
        analysisLength: result.length,
        processingTimeMs,
      });

      return {
        success: true,
        originalText: text,
        analysis: result,
        timestamp: Date.now(),
        processingTimeMs,
      };
    } catch (error) {
      const errorMsg = error?.message || String(error);
      const processingTimeMs = Date.now() - startTime;

      console.log("[ARK_ANALYSIS_ERROR]", {
        error: errorMsg,
        processingTimeMs,
      });

      return {
        success: false,
        originalText: text,
        analysis: "",
        error: errorMsg,
        timestamp: Date.now(),
        processingTimeMs,
      };
    }
  }

  /**
   * 直接调用 Ark API
   * @private
   */
  async callArkApi(text, systemPrompt, apiKey) {
    const endpoint = `${ArkAnalysisService.ARK_BASE_URL}/chat/completions`;

    const requestBody = {
      model: ArkAnalysisService.ARK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    };

    console.log("[ARK_API_REQUEST]", {
      endpoint,
      model: ArkAnalysisService.ARK_MODEL,
      textLength: text.length,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Ark API error (${response.status}): ${errorData || response.statusText}`
      );
    }

    const data = await response.json();

    console.log("[ARK_API_RESPONSE]", {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length || 0,
    });

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Invalid response format from Ark API");
    }

    const analysisText = data.choices[0].message.content;
    if (!analysisText) {
      throw new Error("Empty response from Ark API");
    }

    return analysisText;
  }

  /**
   * 获取默认的分析提示词
   * @private
   */
  getDefaultAnalysisPrompt() {
    return `你是一个专业的问答助手。请对以下问题进行思考并回答，回答内容简洁，抓住重点。
请用中文回复，保持专业和建设性的语气。`;
  }
}

module.exports = new ArkAnalysisService();

