import * as Toast from "@radix-ui/react-toast";

interface ToastState {
  open: boolean;
  title: string;
  description: string;
}

interface AppToastProps {
  toast: ToastState;
  setToast: React.Dispatch<React.SetStateAction<ToastState>>;
}

export function AppToast({ toast, setToast }: AppToastProps) {
  return (
    <>
      <Toast.Root
        className="toast-root"
        open={toast.open}
        onOpenChange={(open) => setToast((current) => ({ ...current, open }))}
        role="status"
        aria-live="polite"
      >
        <Toast.Title>{toast.title}</Toast.Title>
        <Toast.Description>{toast.description}</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="toast-viewport" />
    </>
  );
}
