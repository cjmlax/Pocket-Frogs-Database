import type { ReactNode } from 'react';
import ComboBox from './ComboBox';
import FrogTextInput from './FrogTextInput';
import type { FrogSel } from '../utils/frogIds';
import type { FrogOptions } from '../hooks/useFrogOptions';
import { useFrogEntry } from '../hooks/useFrogEntry';

// Base / Secondary / Breed pickers for one frog — or, with the text-entry site
// setting, one box taking its exact Frog_ID or full name. Both only read their
// selection on mount, so remount (change the key) to load a different frog.
export default function FrogInputs({
  title, sel, onChange, options, children,
}: {
  title: string;
  sel: FrogSel;
  onChange: (s: FrogSel) => void;
  options: Pick<FrogOptions, 'baseOpts' | 'secOpts' | 'breedOpts' | 'lookup'>;
  children?: ReactNode;
}) {
  const { entry } = useFrogEntry();
  return (
    <div className="parent-group">
      <h2 className="parent-title">{title}</h2>
      {entry === 'text' ? (
        <FrogTextInput sel={sel} onChange={onChange} lookup={options.lookup} />
      ) : (
        <>
          <ComboBox
            label="Base Color"
            options={options.baseOpts}
            presorted
            initialSelection={sel.base}
            onSelect={o => onChange({ ...sel, base: o })}
          />
          <ComboBox
            label="Secondary Color"
            options={options.secOpts}
            presorted
            initialSelection={sel.sec}
            onSelect={o => onChange({ ...sel, sec: o })}
          />
          <ComboBox
            label="Breed"
            options={options.breedOpts}
            presorted
            initialSelection={sel.breed}
            onSelect={o => onChange({ ...sel, breed: o })}
          />
        </>
      )}
      {children}
    </div>
  );
}
