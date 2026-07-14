import React from 'react';

interface SwitchProps {
  isActive: boolean;
  onChange: () => void;
  disabled?: boolean;
}

const SwitchPrueba = ({ isActive, onChange, disabled = false }: SwitchProps) => {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300 ${
        isActive ? 'bg-indigo-600' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span 
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${
          isActive ? 'translate-x-6' : 'translate-x-1'
        }`} 
      />
    </button>
  );
};

export default SwitchPrueba;