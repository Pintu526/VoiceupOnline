import { Trash2 } from "lucide-react";

interface InlineDeleteOptionProps {
  label: string;
  onDelete: () => void;
}

export function InlineDeleteOption({ label, onDelete }: InlineDeleteOptionProps) {
  return (
    <button
      className="inline-delete-option"
      type="button"
      onClick={() => {
        if (window.confirm(`${label}?`)) {
          onDelete();
        }
      }}
    >
      <Trash2 size={16} />
      {label}
    </button>
  );
}
