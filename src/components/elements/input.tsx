import { useEffect, useRef } from "react";

interface InputProps {
  placeholder: string;
  value?: string | number;
  name: string;
  type: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  focus?: boolean;
  className?: string;
  defaultValue?: string | number;
}

const Input = ({
  placeholder,
  value,
  name,
  onChange,
  onBlur,
  type,
  className = "",
  defaultValue,
  focus = false,
  ...rest
}: InputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focus]);

  useEffect(() => {
    if (defaultValue && inputRef.current && onChange) {
      const event = {
        target: {
          name: inputRef.current.name,
          value: defaultValue,
        },
      };
      onChange(event as React.ChangeEvent<HTMLInputElement>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className={`input w-full max-w-xs ${className}`}
      ref={inputRef}
      {...rest}
    />
  );
};

export default Input;
