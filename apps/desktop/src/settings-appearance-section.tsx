import type { ThemeMode, ThemePresetId } from "./desktop-state";
import { SettingsGroup, SettingsRow, settingsPill } from "./settings-utils";
import { themePresets } from "./theme-presets";

interface SettingsAppearanceSectionProps {
  readonly themeMode: ThemeMode;
  readonly themePresetId: ThemePresetId;
  readonly onSetThemeMode: (mode: ThemeMode) => void;
  readonly onSetThemePresetId: (presetId: ThemePresetId) => void;
  readonly enableTransparency: boolean;
  readonly onSetEnableTransparency: (enabled: boolean) => void;
}

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

export function SettingsAppearanceSection({
  themeMode,
  themePresetId,
  onSetThemeMode,
  onSetThemePresetId,
  enableTransparency,
  onSetEnableTransparency,
}: SettingsAppearanceSectionProps) {
  return (
    <>
      <SettingsGroup
        title="Appearance"
        description="Day-to-day light/dark lives in the sidebar. Use these controls for system mode, palettes, and window glass."
      >
        <SettingsRow title="Theme" description="System follows your macOS appearance setting.">
          <div className="settings-pill-row" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.mode}
                className={settingsPill(themeMode === option.mode)}
                type="button"
                role="radio"
                aria-checked={themeMode === option.mode}
                onClick={() => onSetThemeMode(option.mode)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title="Window transparency"
          description="Let desktop colors show through supported surfaces."
        >
          <input
            aria-label="Window transparency"
            type="checkbox"
            checked={enableTransparency}
            onChange={(event) => onSetEnableTransparency(event.currentTarget.checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Color preset" description="Palette applied on top of light or dark mode.">
        <div className="theme-preset-grid">
          {themePresets.map((preset) => (
            <label
              className={`theme-preset-card${themePresetId === preset.id ? " theme-preset-card--active" : ""}`}
              key={preset.id}
            >
              <input
                checked={themePresetId === preset.id}
                name="theme-preset"
                type="radio"
                onChange={() => onSetThemePresetId(preset.id)}
              />
              <span className="theme-preset-card__preview" aria-hidden="true">
                {preset.swatches.map((swatch) => (
                  <span
                    className="theme-preset-card__swatch"
                    key={swatch}
                    style={{ background: swatch }}
                  />
                ))}
              </span>
              <span className="theme-preset-card__body">
                <span className="theme-preset-card__title">{preset.name}</span>
                <span className="theme-preset-card__description">{preset.description}</span>
              </span>
            </label>
          ))}
        </div>
      </SettingsGroup>
    </>
  );
}
