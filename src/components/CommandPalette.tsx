import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";

interface CommandItem {
  label: string;
  detail: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  items: CommandItem[];
}

export function CommandPalette({
  open,
  onOpenChange,
  query,
  setQuery,
  items
}: CommandPaletteProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content className="command-dialog" aria-label="Command palette">
          <div className="command-search">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Search commands"
              placeholder="Search campaigns, pages, actions..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>Esc</kbd>
          </div>
          <div className="command-list">
            {items.length === 0 ? (
              <div className="command-empty">No results found.</div>
            ) : (
              items.slice(0, 9).map((item) => (
                <button
                  key={`${item.label}-${item.detail}`}
                  type="button"
                  onClick={() => {
                    item.action();
                    setQuery("");
                    onOpenChange(false);
                  }}
                >
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
