export type DataTableDestination = "captivate" | "local-file" | "both";

export interface DataTable {
  id: string;
  name: string;
  destination: DataTableDestination;
  columns: string[];
  rows: string[][];
}

export function createDefaultTables(): DataTable[] {
  return [
    {
      id: "players",
      name: "Players",
      destination: "captivate",
      columns: ["Name", "Number", "Position", "Team"],
      rows: [
        ["Max Müller", "12", "Forward", "Home"],
        ["Luca Steiner", "30", "Goalie", "Away"],
      ],
    },
    {
      id: "stats",
      name: "Stats",
      destination: "local-file",
      columns: ["Metric", "Home", "Away"],
      rows: [
        ["Shots", "19", "16"],
        ["Penalties", "2", "3"],
      ],
    },
    {
      id: "officials",
      name: "Officials",
      destination: "both",
      columns: ["Role", "Name"],
      rows: [
        ["Referee", "A. Keller"],
        ["Linesman", "T. Fischer"],
      ],
    },
  ];
}
