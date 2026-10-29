// Newsletter: contact files (CSV and Excel), the holiday calendar and the e-mail templates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { contactsFromRows, csvRows, parseContactsFile, verifyUnsubscribe, unsubscribeUrl } from "../src/lib/newsletter";
import { THEMES, personalize, renderNewsletter, upcomingOccasions, withUtm } from "../src/lib/newsletter/templates";

test("reads a WooCommerce-style list: one Nome column, duplicates and bad addresses dropped", () => {
  const r = contactsFromRows([
    ["Nome", "Email", "Encomendas"],
    ["joao sousa", "JPimenta@Gmail.com ", "1"],
    ["Carla van Rensburg", "carla@x.pt", "2"],
    ["Repetido", "jpimenta@gmail.com", "1"],
    ["Sem email", "", "1"],
    ["Mau", "nao-e-email", "1"],
  ]);
  assert.equal(r.contacts.length, 2);
  assert.deepEqual(r.contacts[0], { email: "jpimenta@gmail.com", firstName: "Joao", lastName: "Sousa" });
  assert.equal(r.contacts[1].lastName, "Van Rensburg");
  assert.equal(r.duplicates, 1);
  assert.equal(r.invalid, 1);
});

test("CSV with semicolons, quotes and separate first/last name columns", () => {
  const rows = csvRows('﻿First name;Last name;E-mail\n"Ana";"Silva; Costa";ana@x.pt\n');
  const r = contactsFromRows(rows);
  assert.deepEqual(r.contacts, [{ email: "ana@x.pt", firstName: "Ana", lastName: "Silva; Costa" }]);
});

test("Excel (.xlsx) with shared strings and inline strings", () => {
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>rui@x.pt</t></is></c></row>
    <row r="3"><c r="B3" t="inlineStr"><is><t>maria@x.pt</t></is></c></row>
  </sheetData></worksheet>`;
  const shared = `<sst><si><t>Nome</t></si><si><t>Email</t></si><si><t>Rui &amp; Co</t></si></sst>`;
  const xlsx = zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet), "xl/sharedStrings.xml": strToU8(shared) });
  const r = parseContactsFile("lista.xlsx", xlsx);
  assert.deepEqual(r.contacts.map((c) => [c.email, c.firstName]), [
    ["rui@x.pt", "Rui"],
    ["maria@x.pt", ""],
  ]);
});

test("unsubscribe links are signed per contact", () => {
  const u = new URL(unsubscribeUrl(7));
  assert.equal(verifyUnsubscribe(u.searchParams.get("c"), u.searchParams.get("t")), 7);
  assert.equal(verifyUnsubscribe("8", u.searchParams.get("t")), null);
  assert.equal(verifyUnsubscribe("7", "forged"), null);
});

test("holiday calendar: next occasions with a send-by date (Dia da Mãe = first Sunday of May)", () => {
  const next = upcomingOccasions(new Date(Date.UTC(2026, 9, 29)), 6);
  assert.deepEqual(next.map((o) => o.name), ["Natal", "Passagem de ano", "São Valentim", "Dia do Pai", "Páscoa", "Dia da Mãe"]);
  assert.equal(next[0].sendBy.toISOString().slice(0, 10), "2026-11-20");
  assert.equal(next[4].date.toISOString().slice(0, 10), "2027-03-28"); // Easter 2027
  assert.equal(next[5].date.toISOString().slice(0, 10), "2027-05-02");
});

test("personalisation: first name, or the token and its space disappear", () => {
  assert.equal(personalize("Olá {{nome}},", "Maria"), "Olá Maria,");
  assert.equal(personalize("Olá {{nome}},", ""), "Olá,");
  assert.equal(personalize("Olá {{ NOME }},", null), "Olá,");
});

test("UTM tags only on links into the shop; unsafe links dropped", () => {
  assert.match(withUtm("https://vinho.prendadenatal.com/checkout?b=x2", "natal-2026", "botao"), /b=x2&utm_source=email&utm_medium=newsletter&utm_campaign=natal-2026&utm_content=botao/);
  assert.equal(withUtm("https://example.com/a", "x", "y"), "https://example.com/a");
  assert.equal(withUtm("javascript:alert(1)", "x", "y"), "");
});

test("every template renders with the unsubscribe link, escaped text and no em-dash", () => {
  for (const t of THEMES) {
    const { html, subject } = renderNewsletter(t.key, { ...t.defaults, headline: "<b>x</b> & y" }, { firstName: "Ana", unsubscribeUrl: "https://s/u?c=1&t=2", campaignSlug: "teste" });
    assert.ok(subject.length > 0, t.key);
    assert.ok(html.includes('href="https://s/u?c=1&amp;t=2"'), `${t.key}: unsubscribe link`);
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt; &amp; y"), `${t.key}: headline escaped`);
    assert.ok(html.includes("Olá Ana,"), `${t.key}: greeting`);
    assert.ok(!html.includes("—"), `${t.key}: no em-dash`);
  }
});
