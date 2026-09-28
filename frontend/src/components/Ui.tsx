import type { ReactNode } from 'react'

export function Eyebrow({ children }: { children: string }) {
  return <div className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff6a23]">{children}</div>
}

export function Button({ children, onClick, dark = false }: { children: ReactNode; onClick?: () => void; dark?: boolean }) {
  return <button onClick={onClick} className={`rounded-[3px] px-[21px] py-[15px] text-[13px] font-bold transition hover:brightness-110 ${dark ? 'bg-[#161616] text-white' : 'bg-[#ff641f] text-white shadow-[0_10px_30px_#ff641f32]'}`}>{children}</button>
}
