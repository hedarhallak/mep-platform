// Phase 68 RTL smoke test — May 2026.
//
// One-shot validation that the React Testing Library + jsdom + Vitest
// pipeline is wired correctly. We render an inline trivial component
// (no app routing, no providers, no API) and assert the DOM is queryable
// + the jest-dom matchers from src/test/setup.js are loaded.
//
// Real component tests come in Phase 68b — for now this is the harness
// proof. If this test fails the rest of the front-end suite is suspect.

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function Counter({ initial = 0 }) {
  const [n, setN] = useState(initial);
  return (
    <div>
      <p data-testid="count">count: {n}</p>
      <button onClick={() => setN((x) => x + 1)}>+1</button>
    </div>
  );
}

describe('RTL + jsdom + Vitest smoke', () => {
  test('renders a simple element to the jsdom document', () => {
    render(<Counter />);
    expect(screen.getByTestId('count')).toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('count: 0');
  });

  test('respects component props on initial render', () => {
    render(<Counter initial={42} />);
    expect(screen.getByTestId('count')).toHaveTextContent('count: 42');
  });

  test('user-event click triggers a re-render', async () => {
    const user = userEvent.setup();
    render(<Counter />);
    expect(screen.getByTestId('count')).toHaveTextContent('count: 0');
    await user.click(screen.getByRole('button', { name: '+1' }));
    expect(screen.getByTestId('count')).toHaveTextContent('count: 1');
  });
});
