import type * as DialogPrimitive from "@radix-ui/react-dialog";
import type { HTMLMotionProps } from "motion/react";
import type { FC, ReactNode } from "react";

export type DialogContentProps = React.ComponentProps<
  typeof DialogPrimitive.Content
> &
  HTMLMotionProps<"div">;

export type ModalComponentProps = {
  modalId: string;
  dismiss: () => void;
};

export type ModalComponent<P extends object = Record<string, never>> = FC<
  ModalComponentProps & P
> & {
  contentProps?: Partial<DialogContentProps>;
  contentClassName?: string;
};

export type ModalContentConfig = Partial<DialogContentProps>;

export type ModalItem = {
  id: string;
  render: (props: ModalComponentProps) => ReactNode;
  contentProps?: Partial<DialogContentProps>;
  contentClassName?: string;
  modalContent?: ModalContentConfig;
};
