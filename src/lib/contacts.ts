// A proposal can be addressed to more than one person. Accounts in Airtable
// often list two ("Heather Sabel; Brittany Elise" with two addresses), and a
// deal usually involves a marketing contact as well as the buyer.
//
// The addresses live in one text field, separated by semicolons or commas,
// rather than in their own table: it keeps the builder a single input, and
// the only thing the app does with them is check whether the person at the
// gate is one of them.

/** "a@x.com; b@y.com" → ["a@x.com", "b@y.com"], lowercased and trimmed. */
export function emailList(value: string | null | undefined): string[] {
  return String(value ?? '')
    .split(/[;,\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when every address given is a valid one, and there's at least one. */
export function validEmailList(value: string | null | undefined): boolean {
  const list = emailList(value);
  return list.length > 0 && list.every((address) => EMAIL.test(address));
}

/** Does this address open a proposal addressed to `contacts`? */
export function isAddressedTo(contacts: string | null | undefined, address: string): boolean {
  return emailList(contacts).includes(address.trim().toLowerCase());
}
