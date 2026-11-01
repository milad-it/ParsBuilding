import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput } from '../src/components/common/MoneyInput';

describe('MoneyInput Component', () => {
  it('renders with label and unit', () => {
    const handleChange = vi.fn();
    render(<MoneyInput value={50000} onChange={handleChange} label="مبلغ شارژ" unit="تومان" />);

    expect(screen.getByText('مبلغ شارژ')).toBeInTheDocument();
    expect(screen.getByText('تومان')).toBeInTheDocument();
    expect(screen.getByText(/پنجاه هزار تومان/)).toBeInTheDocument();
  });

  it('updates display and calls onChange when typing Persian/English digits', () => {
    const TestComponent = () => {
      const [val, setVal] = useState(0);
      return <MoneyInput value={val} onChange={setVal} placeholder="مبلغ" />;
    };

    render(<TestComponent />);
    const input = screen.getByPlaceholderText('مبلغ');

    fireEvent.change(input, { target: { value: '۱۲۰۰۰۰' } });
    expect(screen.getByText(/صد و بیست هزار تومان/)).toBeInTheDocument();
  });

  it('displays error message when error prop is provided', () => {
    render(<MoneyInput value={0} onChange={() => {}} error="مبلغ نامعتبر است" />);
    expect(screen.getByText('مبلغ نامعتبر است')).toBeInTheDocument();
  });
});
