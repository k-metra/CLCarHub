import { Link } from "react-router-dom";

export default function PublicFooter() {
  return (
    <footer className="border-t border-white/[.08] py-10 text-center text-xs text-[#777]">
      <div className="mx-auto flex w-[calc(100%-36px)] max-w-[1160px] flex-col items-center justify-between gap-4 sm:flex-row">
        <p>© 2026 CL CarHub. Better rides. Better journeys.</p>
        <nav className="flex gap-5" aria-label="Legal">
          <Link className="transition hover:text-[#ff641f]" to="/terms">
            Terms and conditions
          </Link>
          <Link className="transition hover:text-[#ff641f]" to="/privacy">
            Privacy policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
