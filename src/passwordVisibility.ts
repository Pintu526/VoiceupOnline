export function setPasswordVisibility(
  input: HTMLInputElement,
  toggle: HTMLButtonElement,
  visible: boolean
): void {
  const value = input.value;
  input.type = visible ? "text" : "password";
  input.value = value;
  toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  toggle.setAttribute("aria-pressed", String(visible));
  toggle.setAttribute("title", visible ? "Hide password" : "Show password");

  const showIcon = toggle.querySelector<SVGElement>("[data-password-icon='show']");
  const hideIcon = toggle.querySelector<SVGElement>("[data-password-icon='hide']");
  showIcon?.toggleAttribute("hidden", visible);
  hideIcon?.toggleAttribute("hidden", !visible);
}

export function bindPasswordVisibilityToggle(
  input: HTMLInputElement,
  toggle: HTMLButtonElement
): void {
  setPasswordVisibility(input, toggle, false);
  toggle.addEventListener("click", () => {
    setPasswordVisibility(input, toggle, input.type === "password");
  });
}
