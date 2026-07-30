// The sales team, for the "your name / your email" fields on a proposal.
//
// A short hardcoded list rather than a table: it changes a couple of times a
// year, everyone on it already signs in with one of these addresses, and a
// rep who isn't on it can still type their own name and email.
//
// Alphabetical by first name, which is how the dropdown reads.
export interface Seller {
  id: string;
  name: string;
  email: string;
}

const TEAM: { name: string; email: string }[] = [
  { name: 'Alex Barry', email: 'alexander@blockworks.co' },
  { name: 'Bennett Holloway', email: 'bennett@blockworks.co' },
  { name: 'Brandon Slack', email: 'brandon@blockworks.co' },
  { name: 'Colin Casey', email: 'colin@blockworks.co' },
  { name: 'David Rodriguez', email: 'david.rodriguez@blockworks.co' },
  { name: 'Jason Yanowitz', email: 'jason@blockworks.co' },
  { name: 'Matthew Leightman', email: 'matthew.leightman@blockworks.co' },
  { name: 'Max Widmer', email: 'max@blockworks.co' },
  { name: 'Michael Ippolito', email: 'michael@blockworks.co' },
];

export const SELLERS: Seller[] = [...TEAM]
  .sort((a, b) => a.name.localeCompare(b.name))
  // The picker keys on id; the address is already unique per person.
  .map((seller) => ({ id: seller.email, ...seller }));
