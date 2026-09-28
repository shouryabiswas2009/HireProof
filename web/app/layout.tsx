import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/layout/navbar";
import { Atmosphere } from "@/components/layout/atmosphere";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// The display serif is a system stack, so there is nothing to download
// and nothing leaves the visitor's machine to render a heading.
const DISPLAY_SERIF =
  'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HireProof — Is this job posting actually real?",
  description:
    "Paste a job posting and see how closely its wording matches postings labelled as ghost jobs. Scored in your browser by a logistic regression written from scratch.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      /* `js` is not decoration: the stylesheet starts several elements
         invisible and animates them in, and every one of those rules is
         gated behind .js so that a browser without JavaScript renders
         them plainly rather than leaving them blank forever. Without the
         class the gate never opens and the entrance animations simply
         never ran. */
      className={`${geistSans.variable} ${geistMono.variable} js h-full antialiased`}
      style={{ "--font-display": DISPLAY_SERIF } as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Atmosphere />
          <Navbar userEmail={user?.email ?? null} />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
