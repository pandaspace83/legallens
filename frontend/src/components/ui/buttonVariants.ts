import { cva } from 'class-variance-authority'

// Button styles, shared by <Button> and by links that should look like buttons.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-white shadow-raised hover:bg-primary-hover active:bg-primary-deep',
        secondary:
          'border border-line bg-surface text-fg shadow-raised hover:border-line-strong hover:bg-app',
        ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
        danger: 'bg-danger text-white shadow-raised hover:bg-danger/90',
        link: 'h-auto px-0 text-link underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-[15px] [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
