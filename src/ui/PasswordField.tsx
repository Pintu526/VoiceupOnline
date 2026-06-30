import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
}

export function PasswordField({ value, onChange, placeholder }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        type={isVisible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <button
        className="password-toggle"
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? "Hide passcode" : "Show passcode"}
        title={isVisible ? "Hide passcode" : "Show passcode"}
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
