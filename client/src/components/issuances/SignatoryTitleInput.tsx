interface SignatoryTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Simple free-text input for signatory titles.
 * Replaces the former preset dropdown — users can type any title directly.
 */
export default function SignatoryTitleInput({
  value,
  onChange,
  placeholder = 'e.g., Director',
  className = '',
}: SignatoryTitleInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow ${className}`}
    />
  );
}