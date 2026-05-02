import { type ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export default function Button({ className = '', ...props }: Props) {
  return (
    <button
      className={`bg-blue-500 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-600 active:bg-blue-700 cursor-pointer disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}
