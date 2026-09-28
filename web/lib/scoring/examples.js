/*
 * The three examples from the static site, unchanged.
 *
 * They are not written by eye: each was checked against the current
 * model so that one lands in each band, and tests/test_examples.py in
 * the Python suite re-derives that on every run. Retyping them here
 * would have quietly broken that guarantee.
 */
const EXAMPLES = {
  ghost: `Join Our Talent Community - Software Engineering

About Us

We are a fast-growing, industry-leading technology company on a mission to
transform the way the world works. Our people are our greatest asset, and we
are always looking for passionate, driven individuals who want to make an
impact and grow with us.

Why This Opportunity

This is an exciting opportunity to join a dynamic, fast-paced environment
where no two days are the same. We believe in empowering our people to take
ownership and wear many hats. If you are a self-starter who thrives on
challenge and wants to be part of something bigger, we want to hear from you.

We are not hiring for one specific opening at this time. Instead, we are
building a pipeline of exceptional talent for future opportunities across the
organisation. By joining our talent community, your profile will be kept on
file and reviewed by our recruitment team as new positions become available
across our offices worldwide.

What We Look For

The successful candidate will be a team player with excellent communication
skills and a proven track record of delivering results in a collaborative
environment. You will be comfortable working independently, managing
competing priorities, and adapting quickly as priorities move.

We welcome applications from engineers of any background, whether you are
just starting out or have been doing this for years. If you are excited by
technology and want to push boundaries, there may be a place for you here.

Our Culture

We are more than just a workplace. We are a family of talented, motivated
individuals united by a shared passion for excellence. We work hard, we
celebrate our wins, and we support each other through the challenges. Our
culture is built on trust, transparency, and a relentless focus on the
customer.

We offer a comprehensive benefits package, a competitive salary commensurate
with experience, and the opportunity to work alongside some of the brightest
minds in the industry. Our people enjoy flexible working arrangements, a
generous holiday allowance, and access to ongoing learning and development
resources designed to help you reach your full potential.

Diversity and Inclusion

We are an equal opportunity employer and value diversity at our company. We
do not discriminate on the basis of race, religion, colour, national origin,
gender, sexual orientation, age, marital status, veteran status, or
disability status. We are committed to building a team that represents a
variety of backgrounds, perspectives, and skills, because we believe that
diverse teams build better products.

How To Apply

Simply submit your resume through the link below and complete our short
application form. Our talent acquisition team reviews every submission and
will reach out should a suitable opportunity arise that matches your profile
and career aspirations.

Please note that due to the volume of applications we receive, we are unable
to respond to every applicant individually. Rest assured that your details
will remain on file and you will be among the first to hear about new
openings.

We look forward to connecting with you and exploring how you might become
part of our continued growth story. Apply today and take the next step in
your career journey with a company that truly values its people.`,

  genuine: `Backend Engineer, Payments Team

Salary: $98,000 - $118,000 per year, depending on experience. This range is
the full band for the level; we do not negotiate outside it.

Location: Toronto, hybrid. Two days a week in our King Street office, the
rest remote. We cover the cost of a desk setup at home.

About the team

You would be the seventh engineer on the payments team, reporting to Priya
Raman, who has led the team for three years. The team owns everything that
moves money through the platform: card capture, refunds, payouts to
merchants, and the reconciliation jobs that make sure the ledger matches the
processor at the end of every day.

We process about 40,000 transactions a day. That is small enough that one
person can hold the whole system in their head, and large enough that
mistakes are expensive, so we are careful about testing and rollout.

What you will actually do

In your first month you will ship a small change to the refunds service,
pair with two other engineers on the reconciliation job, and take over the
weekly release checklist. We will not put you on call until month two.

After that, you will own the refunds service end to end. That means the code,
the alerts, the runbook, and the conversations with the support team when a
merchant disputes something. The current owner is moving to the ledger
rewrite and will hand it over properly across four weeks.

Concrete work on the roadmap for the next two quarters: splitting the payouts
job so a single failing merchant cannot block the batch, adding idempotency
keys to the public refunds API, and replacing our nightly reconciliation with
an incremental one so finance stops waiting until 6am for numbers.

You will write Go and SQL against Postgres, ship to Kubernetes, and take
part in the on-call rotation one week in six. Roughly a fifth of your time
goes to reviewing other people's changes, which we treat as real work rather
than something squeezed in around it.

What we need from you

Three or more years writing backend services in a typed language. Go is
ideal, but we have hired people from Java, C# and Rust backgrounds who picked
it up in a few weeks. You should be comfortable reading a query plan and
reasoning about a database transaction.

You do not need payments experience. Two of the current team had none when
they joined, and the domain is learnable in a couple of months.

We do not run whiteboard puzzles. The process is a 45 minute conversation
with Priya, a two hour paired session on a realistic problem using your own
editor, and a final chat with two engineers from other teams.

Timeline and contact

Applications close on 14 March. We aim to give a decision within ten working
days of the final conversation, and the anticipated start date is 5 May,
though we can be flexible for notice periods.

Questions about the role, the team, or the process? Email priya.raman@example.com
and she will answer directly. You do not need to apply first, and asking
questions is not held against anyone.

How we work

The team runs on a two-week cycle. We plan on a Monday, keep a short standup
each morning, and demo whatever shipped on the Friday of the second week. We
do not track story points and we do not measure individual output.

Every change is reviewed before it merges, and we aim to respond within four
hours during working time. Nobody merges to the payment paths alone, not
because we distrust each other but because two sets of eyes on money-handling
code has caught three genuine bugs this year.

Benefits

25 days of holiday plus public holidays, rising by one day per year of
service to a maximum of 30. Private medical cover from day one, a pension
with 6% employer contribution, and a learning budget of $2,000 a year that
people actually spend.

We are a hybrid team and we mean it: the two office days are fixed so that
everyone is in on the same days, rather than each person coming in alone on a
different day of the week.

Equal opportunity

We welcome applications from every background and are happy to adjust the
interview process. If something about the format would put you at a
disadvantage, tell us when you apply and we will change it.`,

  borderline: `Operations Associate

About the role

We are looking for an Operations Associate to join our growing team. This is
a chance to learn how a business works from the inside as it scales, and to
work across a number of different areas at once.

Reporting into the operations function, you will support the day-to-day
running of our fulfilment and customer operations. This is a varied role and
no two days will look the same, so we are looking for someone who is
comfortable when priorities shift and happy to cover a range of work.

Responsibilities

Responsibilities include supporting various operational initiatives across
the business, assisting with the coordination of internal projects, and helping
to maintain our internal documentation.

You will work closely with colleagues across customer support, logistics and
finance to ensure that processes run smoothly. You will help identify areas
where our current ways of working could be improved and support the rollout
of changes once agreed.

You will also assist with reporting, pulling together weekly numbers for the
leadership team and flagging anything that looks unusual. Experience with
spreadsheets is essential, and familiarity with a BI tool would be an
advantage but is not required.

About you

The successful candidate will be a detail-oriented team player with strong
organisational skills and the ability to manage competing priorities. You
will be a self-starter who can work independently, take ownership of your
own workload, and communicate clearly with stakeholders at all levels.

We are looking for someone with a positive attitude who is eager to learn and
grow with the business. Previous operations experience is helpful but we are
open to candidates from a range of backgrounds who can demonstrate the right
mindset and transferable skills.

What we offer

Salary: $52,000 - $58,000 per year, depending on experience.

We offer 25 days of holiday plus public holidays, a company pension scheme,
private medical cover after six months, and a personal development budget
that you can spend on courses, books or conferences.

We are a hybrid team, with most people in the office two or three days a
week. Our office is a ten minute walk from the station and we have a proper
coffee machine, which matters more than it should.

Process

Applications close on 30 April. The process is an initial screening call,
followed by a competency-based interview and a short practical exercise. We
aim to keep the whole process within three weeks.

We are committed to building an inclusive workplace and welcome applications
from all backgrounds. If you need any adjustments to the process, let us know
when you apply and we will accommodate them.`,
};

export { EXAMPLES };
