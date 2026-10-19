import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";

type ReviewPlatform = "google" | "facebook";

const reviewLinks = {
  facebook: "https://m.facebook.com/clcarhub",
  google: {
    cabuyao: "https://g.page/r/CVS5DIpvkKPkEBM/review",
    calamba: "https://g.page/r/Cdt4yVVcP-FsEAI/review",
  },
} as const;

const branches = [
  {
    name: "Cabuyao",
    location: "Cabuyao, Laguna",
    href: reviewLinks.google.cabuyao,
  },
  {
    name: "Calamba",
    location: "Calamba, Laguna",
    href: reviewLinks.google.calamba,
  },
] as const;

function GoogleMark() {
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[25px] font-semibold shadow-sm"
      aria-hidden="true"
    >
      <span className="text-[#4285f4]">G</span>
    </span>
  );
}

function FacebookMark() {
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-full bg-[#1877f2] text-[40px] font-bold leading-[.92] text-white"
      aria-hidden="true"
    >
      f
    </span>
  );
}

export default function ReviewUsPage() {
  const [platform, setPlatform] = useState<ReviewPlatform | null>(null);
  const branchSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (platform !== "google") {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      branchSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [platform]);

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b0b] text-[#f4f3f0]">
      <Seo
        title="Review CL CarHub | Share Your Experience"
        description="Tell us about your CL CarHub experience. Choose Google or Facebook to leave a review."
        path="/review-us"
      />
      <header className="border-b border-white/[.08]">
        <nav className="mx-auto flex h-[76px] w-[calc(100%-36px)] max-w-[720px] items-center justify-between sm:h-[84px]">
          <Link to="/" aria-label="CL CarHub home">
            <img
              src="/clcarhublogo_upscaled.png"
              alt="CL CarHub"
              className="h-16 w-28 object-contain object-left sm:h-20 sm:w-32"
            />
          </Link>
          <Link
            className="text-xs text-[#aaa] transition hover:text-[#ff641f] sm:text-sm"
            to="/"
          >
            Back to home
          </Link>
        </nav>
      </header>

      <main className="relative flex-1 overflow-hidden px-[18px] py-12 sm:px-6 sm:py-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[#ff641f]/10 blur-[110px]" />
        <div className="relative mx-auto max-w-[720px]">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[2.8px] text-[#ff6a23]">
              YOUR FEEDBACK MATTERS
            </p>
            <h1 className="mt-5 font-['Space_Grotesk'] text-[42px] font-semibold leading-[.98] tracking-[-2.5px] sm:text-[60px] sm:tracking-[-3.5px]">
              How was your
              <br />
              <em className="not-italic text-[#ff641f]">CL CarHub ride?</em>
            </h1>
            <p className="mx-auto mt-6 max-w-[470px] text-sm leading-7 text-[#999] sm:text-base">
              We would love to hear about your experience. Choose where you
              would like to leave your review.
            </p>
          </div>

          <section className="mt-10" aria-labelledby="review-options-heading">
            <h2 id="review-options-heading" className="sr-only">
              Choose a review platform
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={platform === "google"}
                className={`group flex min-h-[116px] items-center gap-4 border p-5 text-left transition sm:min-h-[138px] sm:p-6 ${platform === "google" ? "border-[#ff641f] bg-[#1d1511]" : "border-white/[.12] bg-[#151515] hover:border-white/30 hover:bg-[#1b1b1b]"}`}
                onClick={() =>
                  setPlatform(platform === "google" ? null : "google")
                }
              >
                <GoogleMark />
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">
                    Option 01
                  </span>
                  <strong className="mt-2 block font-['Space_Grotesk'] text-xl">
                    Google review
                  </strong>
                  <span className="mt-1 block text-xs text-[#888]">
                    Choose your branch
                  </span>
                </span>
                <span
                  className="ml-auto text-xl text-[#ff641f] transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              </button>

              <a
                className="group flex min-h-[116px] items-center gap-4 border border-white/[.12] bg-[#151515] p-5 text-left transition hover:border-white/30 hover:bg-[#1b1b1b] sm:min-h-[138px] sm:p-6"
                href={reviewLinks.facebook}
                target="_blank"
                rel="noreferrer"
                onClick={() => setPlatform("facebook")}
              >
                <FacebookMark />
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">
                    Option 02
                  </span>
                  <strong className="mt-2 block font-['Space_Grotesk'] text-xl">
                    Facebook review
                  </strong>
                  <span className="mt-1 block text-xs text-[#888]">
                    Share your experience
                  </span>
                </span>
                <span
                  className="ml-auto text-xl text-[#ff641f] transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </a>
            </div>
          </section>

          {platform === "google" && (
            <section
              ref={branchSectionRef}
              className="mt-8 border-t border-white/[.1] pt-8"
              aria-labelledby="branch-heading"
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff6a23]">
                    GOOGLE REVIEWS
                  </p>
                  <h2
                    id="branch-heading"
                    className="mt-2 font-['Space_Grotesk'] text-2xl font-semibold"
                  >
                    Which branch did you visit?
                  </h2>
                </div>
                <button
                  type="button"
                  className="pb-1 text-xs text-[#888] hover:text-white"
                  onClick={() => setPlatform(null)}
                >
                  Change
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {branches.map((branch) => (
                  <a
                    key={branch.name}
                    className="group border border-white/[.12] bg-[#151515] p-5 transition hover:border-[#ff641f] hover:bg-[#1d1511]"
                    href={branch.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className="text-2xl text-[#fbbc04]"
                        aria-hidden="true"
                      >
                        ★
                      </span>
                      <span
                        className="text-lg text-[#ff641f] transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        ↗
                      </span>
                    </span>
                    <strong className="mt-5 block font-['Space_Grotesk'] text-xl">
                      {branch.name}
                    </strong>
                    <span className="mt-1 block text-sm text-[#888]">
                      {branch.location}
                    </span>
                    <span className="mt-5 block text-xs font-semibold text-[#d5d2ce]">
                      Leave a Google review
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <p className="mt-10 text-center text-xs leading-6 text-[#666]">
            Thank you for helping more people discover CL CarHub.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
