import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../src/components/common/Button';
import { Modal } from '../src/components/common/Modal';
import { Badge } from '../src/components/common/Badge';
import { StatCard } from '../src/components/common/StatCard';
import { Tabs } from '../src/components/common/Tabs';

describe('Shared UI Primitives', () => {
  it('renders Button and handles clicks', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>کلیک کنید</Button>);
    const btn = screen.getByRole('button', { name: 'کلیک کنید' });
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders Modal when isOpen is true', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="عنوان مدال">
        <p>محتوای پنجره</p>
      </Modal>
    );
    expect(screen.getByText('عنوان مدال')).toBeInTheDocument();
    expect(screen.getByText('محتوای پنجره')).toBeInTheDocument();
  });

  it('renders Badge with custom variants', () => {
    render(<Badge variant="emerald">تسویه شده</Badge>);
    expect(screen.getByText('تسویه شده')).toBeInTheDocument();
  });

  it('renders StatCard with title, value, and trend', () => {
    render(
      <StatCard
        title="موجودی صندوق"
        value="۵۰,۰۰۰,۰۰۰"
        unit="تومان"
        trend={{ value: '+۱۰٪', isPositive: true }}
      />
    );
    expect(screen.getByText('موجودی صندوق')).toBeInTheDocument();
    expect(screen.getByText('۵۰,۰۰۰,۰۰۰')).toBeInTheDocument();
    expect(screen.getByText('+۱۰٪')).toBeInTheDocument();
  });

  it('renders Tabs and handles tab switching', () => {
    const handleTabChange = vi.fn();
    const tabs = [
      { id: 'tab1', label: 'تب اول' },
      { id: 'tab2', label: 'تب دوم' }
    ];
    render(<Tabs tabs={tabs} activeTab="tab1" onChange={handleTabChange} />);
    expect(screen.getByText('تب اول')).toBeInTheDocument();
    const tab2 = screen.getByText('تب دوم');
    fireEvent.click(tab2);
    expect(handleTabChange).toHaveBeenCalledWith('tab2');
  });
});
