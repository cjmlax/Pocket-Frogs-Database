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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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
    if (selected) {
      setSelected(null);
      onSelect(null);
    }
  }

  function handlePick(option: ComboOption) {
    setSelected(option);
    setInputValue(option.label);
    setIsOpen(false);
    onSelect(option);
  }

  function handleClear() {
    setSelected(null);
    setInputValue('');
    setIsOpen(false);
    onSelect(null);
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
        />
        {inputValue && (
          <button className="combobox-clear" type="button" onClick={handleClear} aria-label="Clear">
            ×
          </button>
        )}
        {isOpen && suggestions.length > 0 && (
          <ul className="combobox-suggestions" role="listbox">
            {suggestions.map(opt => (
              <li
                key={opt.id}
                className="combobox-option"
                role="option"
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
