import React, { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Sliders,
  Mic,
  Brain,
  UserCircle,
  Wrench,
  Keyboard,
  CreditCard,
  Shield,
} from "lucide-react";
import SidebarModal, { SidebarItem } from "./ui/SidebarModal";
import SettingsPage, { SettingsSectionType } from "./SettingsPage";

export type { SettingsSectionType };

// Maps old section IDs to new ones for backward-compatible deep-linking
const SECTION_ALIASES: Record<string, SettingsSectionType> = {
  aiModels: "intelligence",
  agentConfig: "intelligence",
  prompts: "intelligence",
  softwareUpdates: "system",
  privacy: "privacyData",
  permissions: "privacyData",
  developer: "system",
};

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: string;
}

export default function SettingsModal({ open, onOpenChange, initialSection }: SettingsModalProps) {
  const { t } = useTranslation();
  const isDevMode = import.meta.env.DEV;
  const sidebarItems: SidebarItem<SettingsSectionType>[] = useMemo(
    () => {
      const items: SidebarItem<SettingsSectionType>[] = [
        {
          id: "general",
          label: t("settingsModal.sections.general.label"),
          icon: Sliders,
          description: t("settingsModal.sections.general.description"),
          group: t("settingsModal.groups.app"),
        },
        {
          id: "hotkeys",
          label: t("settingsModal.sections.hotkeys.label"),
          icon: Keyboard,
          description: t("settingsModal.sections.hotkeys.description"),
          group: t("settingsModal.groups.app"),
        },
        {
          id: "privacyData",
          label: t("settingsModal.sections.privacyData.label"),
          icon: Shield,
          description: t("settingsModal.sections.privacyData.description"),
          group: t("settingsModal.groups.system"),
        },
      ];

      if (isDevMode) {
        items.push({
          id: "system",
          label: t("settingsModal.sections.system.label"),
          icon: Wrench,
          description: t("settingsModal.sections.system.description"),
          group: t("settingsModal.groups.system"),
        });
      }

      return items;
    },
    [t, isDevMode]
  );

  const [activeSection, setActiveSection] = React.useState<SettingsSectionType>("general");

  // Navigate to initial section when modal opens, resolving legacy aliases
  useEffect(() => {
    if (!open) return;
    if (initialSection) {
      const resolved = (SECTION_ALIASES[initialSection] ?? initialSection) as SettingsSectionType;
      const canOpenSection = sidebarItems.some((item) => item.id === resolved);
      setActiveSection(canOpenSection ? resolved : "general");
      return;
    }
    setActiveSection("general");
  }, [open, initialSection, sidebarItems]);

  return (
    <SidebarModal<SettingsSectionType>
      open={open}
      onOpenChange={onOpenChange}
      title={t("settingsModal.title")}
      sidebarItems={sidebarItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      <SettingsPage activeSection={activeSection} />
    </SidebarModal>
  );
}
