'use client';

// The company field: a real dropdown over the ACCOUNTS table, not a browser
// datalist. A datalist renders as a small arrow that's easy to miss, its
// styling can't be controlled, and Safari barely shows it — which matters
// when picking from 300 accounts is the point.
//
// Still an input, not a select: a company that isn't an account yet has to be
// typeable, and most accounts have no contact details anyway.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface Account {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  logoUrl?: string;
}

export function AccountPicker({
  accounts,
  value,
  onChange,
  onPick,
  name = 'sponsor-company',
  placeholder = 'e.g. Uniswap',
}: {
  accounts: Account[];
  value: string;
  /** Distinct per field: two inputs sharing a name confuses browser autofill. */
  name?: string;
  placeholder?: string;
  /** Typed by hand: the company is whatever they wrote, and it's not an account. */
  onChange: (name: string) => void;
  /** Chosen from the list. */
  onPick: (account: Account) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Click anywhere else and the list goes away. A blur handler alone would
  // close it before a click on an option registered.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const query = value.trim().toLowerCase();
  const matches = accounts
    .filter((account) => !query || account.name.toLowerCase().includes(query))
    // Long enough to scroll through, short enough not to build 300 rows on
    // every keystroke.
    .slice(0, 60);

  return (
    <div ref={box} className="relative">
      <Input
        name={name}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />

      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-neutral-700 bg-neutral-900 shadow-lg">
          {matches.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(account);
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              >
                <span>{account.name}</span>
                {account.contactEmail && (
                  <span className="shrink-0 text-xs text-neutral-500">
                    {account.contactEmail.split(';')[0].trim()}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
