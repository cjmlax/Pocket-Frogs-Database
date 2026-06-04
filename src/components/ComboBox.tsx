import { useState, useRef, useEffect, useId, useMemo } from 'react';

export interface ComboOption {
  id: string;
  label: string;
  /** Optional secondary text (e.g. a breed's level) shown next to the label
   *  and also matched by the filter input. */
  detail?: string;
}

interface ComboBoxProps {
  label: string;
  options: ComboOption[];
  placeholder?: string;
  onSelect: (option: ComboOption | null) => void;
  /** Restores a previously confirmed selection (e.g. from URL params on remount) */
  initialSelection?: ComboOption | null;
  /** When true, keep the given option order instead of sorting alphabetically */
  presorted?: boolean;
}

export default function ComboBox({
  label,
  options,
  placeholder = 'Type to filter…',
  onSelect,
  initialSelection = null,
  presorted = false,
}: ComboBoxProps) {
  const inputId = useId();
  const [inputValue, setInputValue] = useState(initialSelection?.label ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<ComboOption | null>(initialSelection);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Scroll active item into view when navigating with arrow keys.
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Sort alphabetically by default; callers that pre-sort (e.g. breeds by level)
  // pass presorted to keep their order.
  const sortedOptions = useMemo(
    () => (presorted ? options : [...options].sort((a, b) => a.label.localeCompare(b.label))),
    [options, presorted],
  );

  const suggestions = inputValue.trim()
    ? sortedOptions.filter(o =>
        `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(inputValue.toLowerCase()))
    : sortedOptions;

  function handleInput(value: string) {
    setInputValue(value);
    setIsOpen(true);
    setActiveIndex(-1);
    if (selected) {
      setSelected(null);
      onSelect(null);
    }
  }

  function handlePick(option: ComboOption) {
    setSelected(option);
    setInputValue(option.label);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(option);
  }

  function handleClear() {
    setSelected(null);
    setInputValue('');
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        handlePick(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="combobox-field">
      <label className="combobox-label" htmlFor={inputId}>{label}</label>
      <div className="combobox" ref={containerRef}>
        <input
          id={inputId}
          className={`search-input combobox-input${selected ? ' combobox-confirmed' : ''}`}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          autoComplete="off"
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (!selected) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        {inputValue && (
          <button className="combobox-clear" type="button" onClick={handleClear} aria-label="Clear">
            ×
          </button>
        )}
        {isOpen && suggestions.length > 0 && (
          <ul className="combobox-suggestions" role="listbox" ref={listRef}>
            {suggestions.map((opt, i) => (
              <li
                key={opt.id}
                className={`combobox-option${i === activeIndex ? ' combobox-option--active' : ''}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={e => { e.preventDefault(); handlePick(opt); }}
              >
                <span className="combobox-option-label">{opt.label}</span>
                {opt.detail && <span className="combobox-option-detail">{opt.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
