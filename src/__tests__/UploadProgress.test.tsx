import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UploadProgress } from '../ui-components/UploadProgress';

describe('UploadProgress component', () => {
  test('does not render when uploading is false', () => {
    const { container } = render(<UploadProgress uploading={false} progress={0} currentFile={0} totalFiles={0} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders progress bar and text when uploading is true', () => {
    render(<UploadProgress uploading={true} progress={50} currentFile={2} totalFiles={5} />);
    expect(screen.getByText(/Uploading image 2 of 5/i)).toBeInTheDocument();
    // the progress bar has role progressbar
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
