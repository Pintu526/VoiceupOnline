import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  id?: string;
  name?: string;
  placeholder?: string;
  autoComplete?: string;
  showLabel?: string;
  hideLabel?: string;
  required?: boolean;
  disabled?: boolean;
}

export function PasswordField({
  value,
  onChange,
  id,
  name,
  placeholder,
  autoComplete,
  showLabel = "Show password",
  hideLabel = "Hide password",
  required = false,
  disabled = false
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        id={id}
        name={name}
        type={isVisible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        value={value}
        onChange={onChange}
      />
      <button
        className="password-toggle"
        type="button"
        disabled={disabled}
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? hideLabel : showLabel}
        title={isVisible ? hideLabel : showLabel}
        aria-pressed={isVisible}
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
