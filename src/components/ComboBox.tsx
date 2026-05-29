import { useState, useRef, useEffect, useId } from 'react';

export interface ComboOption {
  id: string;
  label: string;
}

interface ComboBoxProps {
  label: string;
  options: ComboOption[];
  placeholder?: string;
  onSelect: (option: ComboOption | null) => void;
  /** Restores a previously confirmed selection (e.g. from URL params on remount) */
  initialSelection?: ComboOption | null;
}

export default function ComboBox({
  label,
  options,
  placeholder = 'Type to filter…',
  onSelect,
  initialSelection = null,
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

  const suggestions = inputValue.trim()
    ? options.filter(o => o.label.toLowerCase().includes(inputValue.toLowerCase()))
    : options.slice(0, 8);

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
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
