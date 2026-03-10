import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from "@assistant-ui/react";

const ThreadListItem = () => (
  <ThreadListItemPrimitive.Root className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 data-[active]:bg-neutral-800 data-[active]:text-white">
    <ThreadListItemPrimitive.Trigger className="flex-1 truncate text-left">
      <ThreadListItemPrimitive.Title fallback="New conversation" />
    </ThreadListItemPrimitive.Trigger>
    <ThreadListItemPrimitive.Delete className="hidden shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 group-hover:block">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
      </svg>
    </ThreadListItemPrimitive.Delete>
  </ThreadListItemPrimitive.Root>
);

export function ThreadList() {
  return (
    <ThreadListPrimitive.Root className="flex h-full flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-200">SensAI</span>
        <ThreadListPrimitive.New className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
        </ThreadListPrimitive.New>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ThreadListPrimitive.Items
          components={{ ThreadListItem }}
        />
      </div>
    </ThreadListPrimitive.Root>
  );
}
