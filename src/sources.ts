// Every monitored source. Shared by the scraper (url + kind) and the digest (labels + grouping).

export type SourceKind =
  | "govpl-listing" // gov.pl "wiadomosci"/"aktualnosci" listing (paged with ?page=1&size=10)
  | "govpl-homepage" // gov.pl ministry homepage, "Aktualności" section
  | "czech" // MŽP / MF / DIA: "### [Title](url)" + date
  | "mpo" // MPO: find latest stranka-NNN, then parse like "czech"
  | "mf" // MF press releases: "[Title](url)" + date line
  | "msmt"
  | "sfzp"
  | "minzp" // Firecrawl raw HTML (page has ~200 articles; parser reads HTML)
  | "mhsr"
  | "minedu"
  | "mirri"
  | "envirofond";

export interface Source {
  key: string;
  label: string;
  url: string;
  kind: SourceKind;
}

export interface Country {
  code: "PL" | "CZ" | "SK";
  name: string;
  flag: string;
  sources: Source[];
}

export const COUNTRIES: Country[] = [
  {
    code: "PL",
    name: "Poland",
    flag: "\u{1F1F5}\u{1F1F1}",
    sources: [
      { key: "klimat", label: "Ministry of Climate and Environment", url: "https://www.gov.pl/web/klimat/wiadomosci", kind: "govpl-listing" },
      { key: "energia", label: "Ministry of Energy", url: "https://www.gov.pl/web/energia/wiadomosci", kind: "govpl-listing" },
      { key: "nauka", label: "Ministry of Science and Higher Education", url: "https://www.gov.pl/web/nauka/wiadomosci", kind: "govpl-listing" },
      { key: "cyfryzacja", label: "Ministry of Digitalization", url: "https://www.gov.pl/web/cyfryzacja/wiadomosci", kind: "govpl-listing" },
      { key: "aktywa", label: "Ministry of State Assets", url: "https://www.gov.pl/web/aktywa-panstwowe", kind: "govpl-homepage" },
      { key: "nfosigw", label: "NFOŚiGW (National Fund for Environmental Protection)", url: "https://www.gov.pl/web/nfosigw/aktualnosci", kind: "govpl-listing" },
    ],
  },
  {
    code: "CZ",
    name: "Czech Republic",
    flag: "\u{1F1E8}\u{1F1FF}",
    sources: [
      { key: "cz-mzp", label: "MŽP (Ministry of the Environment)", url: "https://www.mzp.gov.cz/cz/pro-media-a-verejnost/aktuality/archiv-tiskovych-zprav", kind: "czech" },
      { key: "cz-mpo", label: "MPO (Ministry of Industry and Trade)", url: "https://mpo.gov.cz/cz/rozcestnik/pro-media/tiskove-zpravy/", kind: "mpo" },
      { key: "cz-msmt", label: "MŠMT (Ministry of Education, Youth and Sports)", url: "https://msmt.gov.cz/aktuality", kind: "msmt" },
      { key: "cz-sfzp", label: "SFŽP (State Environmental Fund)", url: "https://sfzp.gov.cz/tiskove-centrum/aktuality/", kind: "sfzp" },
      { key: "cz-mf", label: "MF (Ministry of Finance)", url: "https://mf.gov.cz/cs/ministerstvo/media/tiskove-zpravy", kind: "mf" },
      { key: "cz-dia", label: "DIA (Digital and Information Agency)", url: "https://www.dia.gov.cz/cs/aktuality", kind: "czech" },
    ],
  },
  {
    code: "SK",
    name: "Slovakia",
    flag: "\u{1F1F8}\u{1F1F0}",
    sources: [
      { key: "sk-minzp", label: "MŽP SR (Ministry of the Environment)", url: "https://www.minzp.sk/spravy/", kind: "minzp" },
      { key: "sk-mhsr", label: "MH SR (Ministry of Economy)", url: "https://www.mhsr.sk/aktuality", kind: "mhsr" },
      { key: "sk-minedu", label: "MŠVVaM SR (Ministry of Education)", url: "https://www.minedu.sk/aktuality/", kind: "minedu" },
      { key: "sk-mirri", label: "MIRRI SR (Ministry of Investments and Informatization)", url: "https://mirri.gov.sk/vsetky-aktuality/", kind: "mirri" },
      { key: "sk-envirofond", label: "Environmental Fund", url: "https://envirofond.sk/aktuality/", kind: "envirofond" },
    ],
  },
];

export const ALL_SOURCES: Source[] = COUNTRIES.flatMap((c) => c.sources);
