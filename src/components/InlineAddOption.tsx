import { Plus } from "lucide-react";

interface InlineAddOptionProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  disabled: boolean;
  duplicate: boolean;
}

export function InlineAddOption({
  placeholder,
  value,
  onChange,
  onAdd,
  disabled,
  duplicate
}: InlineAddOptionProps) {
  return (
    <div className="inline-add-option">
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="inline-add-button"
        type="button"
        onClick={onAdd}
        disabled={disabled}
        title="Add to dropdown"
      >
        <Plus size={16} />
      </button>
      {duplicate && <small>Already in dropdown</small>}
    </div>
  );
}
