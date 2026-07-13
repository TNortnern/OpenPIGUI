import { useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import {
  buildModelOptions,
  MODEL_OPTIONS_EMPTY_TITLE,
  type ComposerModelOption,
} from "./composer-commands";
import {
  modelSupportsThinkingSelector,
  thinkingOptionsForModel,
} from "./thinking-options";
import { CheckIcon, ChevronDownIcon, CloseIcon, PlusIcon, SearchIcon, SlidersIcon } from "./icons";
import {
  isModelPatternEnabled,
  modelPatternKey,
  nextScopedPatternsAfterProviderToggle,
  nextScopedPatternsAfterToggle,
  providerVisibilityState,
  showAllScopedPatterns,
} from "./model-visibility";
import { matchesModelSearch } from "./model-search";

interface ModelSelectorProps {
  readonly runtime: RuntimeSnapshot | undefined;
  readonly provider: string | undefined;
  readonly modelId: string | undefined;
  readonly thinkingLevel: string | undefined;
  readonly disabled?: boolean;
  readonly dropdownPlacement?: "above" | "below";
  readonly showEmptyModelControl?: boolean;
  readonly unselectedModelLabel?: string;
  readonly emptyModelLabel?: string;
  readonly emptyModelTitle?: string;
  readonly onSetModel: (provider: string, modelId: string) => void;
  readonly onSetThinking: (level: string) => void;
  readonly onSetScopedModelPatterns?: (patterns: readonly string[]) => void;
  readonly onOpenModelSettings?: (section: "models" | "providers") => void;
}

type OpenDropdown = "none" | "model" | "thinking";
type ModelPanel = "picker" | "visibility";

export function ModelSelector({
  runtime,
  provider,
  modelId,
  thinkingLevel,
  disabled,
  dropdownPlacement = "above",
  showEmptyModelControl = false,
  unselectedModelLabel = "Choose model",
  emptyModelLabel = "Choose model",
  emptyModelTitle = MODEL_OPTIONS_EMPTY_TITLE,
  onSetModel,
  onSetThinking,
  onSetScopedModelPatterns,
  onOpenModelSettings,
}: ModelSelectorProps) {
  const [open, setOpen] = useState<OpenDropdown>("none");
  const [modelPanel, setModelPanel] = useState<ModelPanel>("picker");
  const [modelFilter, setModelFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const modelOptions = useMemo(() => buildModelOptions(runtime), [runtime]);
  const thinkingOptions = useMemo(
    () => thinkingOptionsForModel(runtime, provider, modelId),
    [runtime, provider, modelId],
  );
  const showThinkingSelector = modelSupportsThinkingSelector(runtime, provider, modelId);
  const modelMetaByKey = useMemo(() => {
    const map = new Map<string, { providerName: string; label: string }>();
    for (const model of runtime?.models ?? []) {
      map.set(`${model.providerId}:${model.modelId}`, {
        providerName: model.providerName,
        label: model.label,
      });
    }
    return map;
  }, [runtime]);

  const filteredModels = useMemo(() => {
    if (!modelFilter.trim()) return modelOptions;
    return modelOptions.filter((opt) => {
      const meta = modelMetaByKey.get(`${opt.providerId}:${opt.modelId}`);
      return matchesModelSearch(modelFilter, [
        opt.providerId,
        opt.modelId,
        opt.label,
        opt.description,
        meta?.providerName,
        meta?.label,
      ]);
    });
  }, [modelOptions, modelFilter, modelMetaByKey]);

  const groupedModels = useMemo(
    () => groupByProvider(filteredModels, modelMetaByKey),
    [filteredModels, modelMetaByKey],
  );

  const availableModels = useMemo(
    () => (runtime?.models ?? []).filter((model) => model.available),
    [runtime],
  );
  const availablePatterns = useMemo(
    () => availableModels.map((model) => modelPatternKey(model.providerId, model.modelId)),
    [availableModels],
  );
  const enabledPatterns = runtime?.settings.enabledModelPatterns ?? [];

  const visibilityGroups = useMemo(() => {
    const filtered = visibilityFilter.trim()
      ? availableModels.filter((model) =>
          matchesModelSearch(visibilityFilter, [
            model.providerId,
            model.providerName,
            model.modelId,
            model.label,
          ]),
        )
      : availableModels;

    const groups = new Map<
      string,
      { providerId: string; providerName: string; items: Array<(typeof filtered)[number]> }
    >();
    for (const model of filtered) {
      const existing = groups.get(model.providerId);
      if (existing) {
        existing.items.push(model);
      } else {
        groups.set(model.providerId, {
          providerId: model.providerId,
          providerName: model.providerName,
          items: [model],
        });
      }
    }
    return Array.from(groups.values());
  }, [availableModels, visibilityFilter]);

  const hasAvailableModelOptions = modelOptions.length > 0;
  const hasModelControl = Boolean(provider && modelId) || hasAvailableModelOptions || availableModels.length > 0;
  const shouldRenderModelControl = hasModelControl || showEmptyModelControl;
  const modelBadgeLabel = provider && modelId ? `${provider}:${modelId}` : hasAvailableModelOptions ? unselectedModelLabel : emptyModelLabel;
  const noMatchingModels = hasAvailableModelOptions && modelFilter.trim().length > 0 && groupedModels.length === 0;
  const canManageVisibility = typeof onSetScopedModelPatterns === "function";

  useEffect(() => {
    if (open === "none") {
      setModelFilter("");
      setVisibilityFilter("");
      setModelPanel("picker");
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen("none");
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (open === "model" && modelPanel === "visibility") {
          setModelPanel("picker");
          return;
        }
        setOpen("none");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, modelPanel]);

  if (!shouldRenderModelControl && !showThinkingSelector) {
    return null;
  }

  const dropdownPlacementClass =
    dropdownPlacement === "below" ? " model-selector__dropdown--below" : "";

  const toggleVisibility = (pattern: string, enable: boolean) => {
    if (!onSetScopedModelPatterns) return;
    const next = nextScopedPatternsAfterToggle({
      currentPatterns: enabledPatterns,
      availablePatterns,
      pattern,
      enable,
    });
    if (!next) return;
    onSetScopedModelPatterns(next);
  };

  const toggleProviderVisibility = (providerPatterns: readonly string[], enable: boolean) => {
    if (!onSetScopedModelPatterns) return;
    const next = nextScopedPatternsAfterProviderToggle({
      currentPatterns: enabledPatterns,
      availablePatterns,
      providerPatterns,
      enable,
    });
    if (!next) return;
    onSetScopedModelPatterns(next);
  };

  return (
    <span className="model-selector" ref={containerRef}>
      {shouldRenderModelControl ? (
        <span className="model-selector__anchor">
          <button
            className="model-selector__badge"
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open === "model"}
            onClick={() => setOpen(open === "model" ? "none" : "model")}
          >
            <span className="model-selector__badge-label">{modelBadgeLabel}</span>
            <span className="model-selector__badge-chevron" aria-hidden="true">
              <ChevronDownIcon />
            </span>
          </button>
          {open === "model" ? (
            <div
              className={`model-selector__dropdown${dropdownPlacementClass}${
                modelPanel === "visibility" ? " model-selector__dropdown--visibility" : ""
              }`}
              role="listbox"
              onWheel={(event) => event.stopPropagation()}
            >
              {modelPanel === "visibility" ? (
                <VisibilityPanel
                  groups={visibilityGroups}
                  enabledPatterns={enabledPatterns}
                  filter={visibilityFilter}
                  onFilterChange={setVisibilityFilter}
                  onToggle={toggleVisibility}
                  onToggleProvider={toggleProviderVisibility}
                  onShowAll={() => onSetScopedModelPatterns?.(showAllScopedPatterns())}
                  onDone={() => setModelPanel("picker")}
                />
              ) : (
                <>
                  <div className="model-selector__toolbar">
                    <label className="model-selector__search">
                      <SearchIcon />
                      <input
                        className="model-selector__filter-input"
                        placeholder="Search providers or models"
                        value={modelFilter}
                        onChange={(e) => setModelFilter(e.target.value)}
                        autoFocus
                        aria-label="Search providers or models"
                      />
                      {modelFilter.trim() ? (
                        <button
                          type="button"
                          className="model-selector__search-clear"
                          aria-label="Clear search"
                          title="Clear search"
                          onClick={(event) => {
                            event.preventDefault();
                            setModelFilter("");
                          }}
                        >
                          <CloseIcon />
                        </button>
                      ) : null}
                    </label>
                    {onOpenModelSettings ? (
                      <button
                        type="button"
                        className="model-selector__icon-btn"
                        aria-label="Add models in Settings"
                        title="Add models"
                        onClick={() => {
                          setOpen("none");
                          onOpenModelSettings("models");
                        }}
                      >
                        <PlusIcon />
                      </button>
                    ) : null}
                    {canManageVisibility ? (
                      <button
                        type="button"
                        className="model-selector__icon-btn"
                        aria-label="Choose visible models"
                        title="Visible models"
                        onClick={() => setModelPanel("visibility")}
                      >
                        <SlidersIcon />
                      </button>
                    ) : null}
                  </div>

                  <div className="model-selector__list">
                    {groupedModels.map((group) => (
                      <div className="model-selector__group" key={group.providerId}>
                        <div className="model-selector__group-title">{group.providerName}</div>
                        {group.items.map((option) => {
                          const isActive = option.providerId === provider && option.modelId === modelId;
                          const meta = modelMetaByKey.get(`${option.providerId}:${option.modelId}`);
                          return (
                            <button
                              className={`model-selector__item${isActive ? " model-selector__item--active" : ""}`}
                              key={`${option.providerId}:${option.modelId}`}
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onClick={() => {
                                if (!isActive) {
                                  onSetModel(option.providerId, option.modelId);
                                }
                                setOpen("none");
                              }}
                            >
                              <span className="model-selector__item-label">{meta?.label ?? option.modelId}</span>
                              {isActive ? (
                                <span className="model-selector__item-check" aria-hidden="true">
                                  <CheckIcon />
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    {groupedModels.length === 0 ? (
                      <div className="model-selector__empty-block">
                        <div className="model-selector__group-title">
                          {noMatchingModels ? "No matching models" : emptyModelTitle}
                        </div>
                        {noMatchingModels ? (
                          <>
                            <div className="model-selector__empty">
                              No results for “{modelFilter.trim()}”. Try provider and model names together.
                            </div>
                            <button
                              type="button"
                              className="model-selector__empty-action"
                              onClick={() => setModelFilter("")}
                            >
                              Clear search
                            </button>
                          </>
                        ) : onOpenModelSettings ? (
                          <button
                            type="button"
                            className="model-selector__empty-action"
                            onClick={() => {
                              setOpen("none");
                              onOpenModelSettings("providers");
                            }}
                          >
                            Connect a provider
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </span>
      ) : null}
      {showThinkingSelector ? (
        <span className="model-selector__anchor">
          <button
            className="model-selector__badge"
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open === "thinking"}
            onClick={() => setOpen(open === "thinking" ? "none" : "thinking")}
          >
            <span className="model-selector__badge-label">{thinkingLevel ?? thinkingOptions[0]?.value ?? "off"}</span>
            <span className="model-selector__badge-chevron" aria-hidden="true">
              <ChevronDownIcon />
            </span>
          </button>
          {open === "thinking" ? (
            <div
              className={`model-selector__dropdown model-selector__dropdown--thinking${dropdownPlacementClass}`}
              role="listbox"
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="model-selector__group-title">Thinking Level</div>
              {thinkingOptions.map((option) => {
                const isActive = option.value === thinkingLevel;
                return (
                  <button
                    className={`model-selector__item model-selector__item--thinking${isActive ? " model-selector__item--active" : ""}`}
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      if (!isActive) {
                        onSetThinking(option.value);
                      }
                      setOpen("none");
                    }}
                  >
                    <span className="model-selector__item-label">{option.label}</span>
                    <span className="model-selector__item-meta">{option.description}</span>
                    <span className="model-selector__item-check" aria-hidden="true">
                      {isActive ? <CheckIcon /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

interface VisibilityGroup {
  readonly providerId: string;
  readonly providerName: string;
  readonly items: readonly {
    readonly providerId: string;
    readonly modelId: string;
    readonly label: string;
  }[];
}

function VisibilityPanel({
  groups,
  enabledPatterns,
  filter,
  onFilterChange,
  onToggle,
  onToggleProvider,
  onShowAll,
  onDone,
}: {
  readonly groups: readonly VisibilityGroup[];
  readonly enabledPatterns: readonly string[];
  readonly filter: string;
  readonly onFilterChange: (value: string) => void;
  readonly onToggle: (pattern: string, enable: boolean) => void;
  readonly onToggleProvider: (providerPatterns: readonly string[], enable: boolean) => void;
  readonly onShowAll: () => void;
  readonly onDone: () => void;
}) {
  const enabledCount = groups.reduce((count, group) => {
    return (
      count +
      group.items.filter((item) =>
        isModelPatternEnabled(enabledPatterns, modelPatternKey(item.providerId, item.modelId)),
      ).length
    );
  }, 0);

  return (
    <div className="model-selector__visibility">
      <div className="model-selector__visibility-header">
        <div className="model-selector__visibility-title">Visible models</div>
        <p className="model-selector__visibility-copy">
          Hidden models stay installed; they just leave the selector.
        </p>
        <label className="model-selector__search">
          <SearchIcon />
          <input
            className="model-selector__filter-input"
            placeholder="Filter providers or models"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            autoFocus
            aria-label="Filter providers or models"
          />
          {filter.trim() ? (
            <button
              type="button"
              className="model-selector__search-clear"
              aria-label="Clear filter"
              title="Clear filter"
              onClick={(event) => {
                event.preventDefault();
                onFilterChange("");
              }}
            >
              <CloseIcon />
            </button>
          ) : null}
        </label>
      </div>

      <div className="model-selector__list">
        {groups.map((group) => {
          const providerPatterns = group.items.map((item) =>
            modelPatternKey(item.providerId, item.modelId),
          );
          const providerState = providerVisibilityState(enabledPatterns, providerPatterns);
          const providerEnabledCount = providerPatterns.filter((pattern) =>
            isModelPatternEnabled(enabledPatterns, pattern),
          ).length;
          const providerIsOnlyVisible = providerState !== "none" && enabledCount <= providerEnabledCount;
          return (
            <div className="model-selector__group" key={group.providerId}>
              <ProviderVisibilityHeader
                providerName={group.providerName}
                state={providerState}
                disableUncheck={providerIsOnlyVisible}
                onToggle={(enable) => onToggleProvider(providerPatterns, enable)}
              />
              {group.items.map((item) => {
                const pattern = modelPatternKey(item.providerId, item.modelId);
                const enabled = isModelPatternEnabled(enabledPatterns, pattern);
                const isLast = enabled && enabledCount <= 1;
                return (
                  <label
                    className={`model-selector__visibility-row${enabled ? "" : " model-selector__visibility-row--off"}`}
                    key={pattern}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={isLast}
                      title={isLast ? "At least one model must stay visible" : undefined}
                      onChange={(event) => onToggle(pattern, event.target.checked)}
                    />
                    <span className="model-selector__item-label">{item.label}</span>
                  </label>
                );
              })}
            </div>
          );
        })}
        {groups.length === 0 ? <div className="model-selector__empty">No models match.</div> : null}
      </div>

      <div className="model-selector__visibility-footer">
        <button type="button" className="model-selector__text-btn" onClick={onShowAll}>
          Show all
        </button>
        <button type="button" className="model-selector__done-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function ProviderVisibilityHeader({
  providerName,
  state,
  disableUncheck,
  onToggle,
}: {
  readonly providerName: string;
  readonly state: "all" | "some" | "none";
  readonly disableUncheck: boolean;
  readonly onToggle: (enable: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === "some";
    }
  }, [state]);

  return (
    <label className="model-selector__provider-toggle">
      <input
        ref={inputRef}
        type="checkbox"
        checked={state === "all"}
        disabled={disableUncheck && state !== "none"}
        title={
          disableUncheck && state !== "none"
            ? "At least one model must stay visible"
            : `Toggle all ${providerName} models`
        }
        aria-label={`Toggle all ${providerName} models`}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <span className="model-selector__group-title model-selector__group-title--inline">{providerName}</span>
    </label>
  );
}

interface ModelGroup {
  readonly providerId: string;
  readonly providerName: string;
  readonly items: readonly ComposerModelOption[];
}

function groupByProvider(
  options: readonly ComposerModelOption[],
  metaByKey: ReadonlyMap<string, { providerName: string; label: string }>,
): readonly ModelGroup[] {
  const groups = new Map<string, { providerId: string; providerName: string; items: ComposerModelOption[] }>();
  for (const option of options) {
    const meta = metaByKey.get(`${option.providerId}:${option.modelId}`);
    const providerName = meta?.providerName ?? option.providerId;
    const existing = groups.get(option.providerId);
    if (existing) {
      existing.items.push(option);
    } else {
      groups.set(option.providerId, {
        providerId: option.providerId,
        providerName,
        items: [option],
      });
    }
  }
  return Array.from(groups.values());
}
