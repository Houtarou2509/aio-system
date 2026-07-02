import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignatoryTitleInput from './SignatoryTitleInput';

describe('SignatoryTitleInput', () => {
  it('renders as a textbox, not a combobox', () => {
    render(<SignatoryTitleInput value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
  });

  it('does not render a combobox', () => {
    render(<SignatoryTitleInput value="" onChange={() => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('displays the current value', () => {
    render(<SignatoryTitleInput value="Project Director" onChange={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Project Director');
  });

  it('calls onChange when the user types', () => {
    const onChange = vi.fn();
    render(<SignatoryTitleInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Project Director' } });
    expect(onChange).toHaveBeenCalledWith('Project Director');
  });

  it('renders placeholder text', () => {
    render(<SignatoryTitleInput value="" onChange={() => {}} placeholder="e.g., Authorized Signatory" />);
    expect(screen.getByPlaceholderText('e.g., Authorized Signatory')).toBeTruthy();
  });

  it('uses default placeholder "e.g., Director" when none provided', () => {
    render(<SignatoryTitleInput value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('e.g., Director')).toBeTruthy();
  });

  it('does not render dropdown/preset labels', () => {
    const { container } = render(<SignatoryTitleInput value="" onChange={() => {}} />);
    const html = container.innerHTML;
    expect(html).not.toContain('Select a title...');
    expect(html).not.toContain('Other / Custom title...');
    expect(html).not.toContain('Back to presets');
  });

  it('accepts arbitrary titles like "School Head" without mode switching', () => {
    const { rerender } = render(<SignatoryTitleInput value="" onChange={() => {}} />);
    rerender(<SignatoryTitleInput value="School Head" onChange={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('School Head');
    // Still a textbox, never a combobox
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('updates value when prop changes (e.g. template switch)', () => {
    const { rerender } = render(<SignatoryTitleInput value="Director" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Director');
    rerender(<SignatoryTitleInput value="Unit Head" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Unit Head');
  });

  it('applies custom className', () => {
    render(<SignatoryTitleInput value="" onChange={() => {}} className="my-custom-class" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.className).toContain('my-custom-class');
  });
});