// The lawyer's question, right-aligned in a soft bubble (FE-4.5).
export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[82%] rounded-[20px] rounded-br-[6px] bg-hover px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-fg">
        {content}
      </p>
    </div>
  )
}
