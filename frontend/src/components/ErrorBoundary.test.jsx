import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Boom({ explode }) {
  if (explode) throw new Error("kaboom from child");
  return <div data-testid="ok-child">all good</div>;
}

let errSpy;
beforeEach(() => {
  // React logs caught errors to console.error; silence the expected noise.
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

test("renders children when nothing throws", () => {
  render(
    <ErrorBoundary resetKey="/a">
      <Boom explode={false} />
    </ErrorBoundary>
  );
  expect(screen.getByTestId("ok-child")).toBeInTheDocument();
});

test("catches a render error and shows the recoverable fallback (no blank page)", () => {
  render(
    <ErrorBoundary resetKey="/a">
      <Boom explode={true} />
    </ErrorBoundary>
  );
  expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
  expect(screen.getByText("Something went wrong on this page")).toBeInTheDocument();
  expect(screen.getByText(/kaboom from child/)).toBeInTheDocument();
});

test("clears the error when resetKey changes (navigation)", () => {
  const { rerender } = render(
    <ErrorBoundary resetKey="/a">
      <Boom explode={true} />
    </ErrorBoundary>
  );
  expect(screen.getByTestId("error-boundary")).toBeInTheDocument();

  // Navigate to a different route with a healthy child.
  rerender(
    <ErrorBoundary resetKey="/b">
      <Boom explode={false} />
    </ErrorBoundary>
  );
  expect(screen.getByTestId("ok-child")).toBeInTheDocument();
  expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
});
