export const VIEW_BOX = { width: 1600, height: 1080 };

// The geometry is intentionally schematic. Station order comes from the route
// profiles; these corridors only decide where the shared network is drawn.
export const corridors = [
  {
    id: "central",
    lines: ["1", "2", "3", "4", "5"],
    stations: ["Majorstuen", "Nationaltheatret", "Stortinget", "Jernbanetorget", "Grønland", "Tøyen", "Ensjø", "Helsfyr", "Brynseng"],
    points: [[520, 500], [760, 500], [1010, 500], [1110, 555]]
  },
  {
    id: "frognerseteren",
    lines: ["1"],
    stations: ["Majorstuen", "Frøen", "Steinerud", "Vinderen", "Gaustad", "Ris", "Slemdal", "Gråkammen", "Gulleråsen", "Vettakollen", "Skådalen", "Midtstuen", "Besserud", "Holmenkollen", "Voksenlia", "Skogen", "Lillevann", "Voksenkollen", "Frognerseteren"],
    points: [[520, 500], [440, 440], [365, 365], [290, 300], [225, 220], [185, 125]]
  },
  {
    id: "west-common",
    lines: ["2", "3", "5"],
    stations: ["Majorstuen", "Borgen", "Smestad"],
    points: [[520, 500], [450, 570], [390, 610]]
  },
  {
    id: "osteras",
    lines: ["2"],
    stations: ["Smestad", "Makrellbekken", "Holmen", "Hovseter", "Røa", "Ekraveien", "Eiksmarka", "Lijordet", "Østerås"],
    points: [[390, 610], [300, 650], [215, 690], [150, 760], [115, 845]]
  },
  {
    id: "kolsaas-common",
    lines: ["3", "5"],
    stations: ["Smestad", "Montebello", "Ullernåsen", "Åsjordet", "Bjørnsletta", "Jar", "Ringstabekk", "Bekkestua", "Gjønnes", "Haslum", "Avløs"],
    points: [[390, 610], [390, 700], [330, 765], [265, 820], [205, 865]]
  },
  {
    id: "kolsaas-tail",
    lines: ["3"],
    stations: ["Avløs", "Gjettum", "Hauger", "Kolsås"],
    points: [[205, 865], [150, 920], [115, 995]]
  },
  {
    id: "ring-north",
    lines: ["4", "5"],
    stations: ["Majorstuen", "Blindern", "Forskningsparken", "Ullevål stadion", "Nydalen", "Storo", "Sinsen"],
    points: [[520, 500], [540, 390], [610, 315], [720, 275], [835, 300]]
  },
  {
    id: "sognsvann",
    lines: ["5"],
    stations: ["Ullevål stadion", "Berg", "Tåsen", "Østhorn", "Holstein", "Kringsjå", "Sognsvann"],
    points: [[610, 315], [610, 245], [610, 170], [610, 90]]
  },
  {
    id: "ring-east",
    lines: ["5"],
    stations: ["Sinsen", "Carl Berners plass", "Tøyen"],
    points: [[835, 300], [910, 380], [1010, 500]]
  },
  {
    id: "loren-link",
    lines: ["4"],
    stations: ["Sinsen", "Løren", "Økern"],
    points: [[835, 300], [930, 285], [1005, 315]]
  },
  {
    id: "grorud-entry",
    lines: ["5"],
    stations: ["Carl Berners plass", "Hasle", "Økern"],
    points: [[910, 380], [955, 345], [1005, 315]]
  },
  {
    id: "grorud",
    lines: ["4", "5"],
    stations: ["Økern", "Risløkka", "Vollebekk", "Linderud", "Veitvet", "Rødtvet", "Kalbakken", "Ammerud", "Grorud", "Romsås", "Rommen", "Stovner", "Vestli"],
    points: [[1005, 315], [1075, 275], [1145, 220], [1225, 165], [1300, 105], [1390, 95]]
  },
  {
    id: "lambertseter",
    lines: ["1", "4"],
    stations: ["Brynseng", "Høyenhall", "Manglerud", "Ryen", "Brattlikollen", "Karlsrud", "Lambertseter", "Munkelia", "Bergkrystallen"],
    points: [[1110, 555], [1160, 635], [1200, 720], [1225, 820], [1225, 990]]
  },
  {
    id: "hellerud-link",
    lines: ["2", "3"],
    stations: ["Brynseng", "Hellerud"],
    points: [[1110, 555], [1215, 570]]
  },
  {
    id: "ellingsrud",
    lines: ["2"],
    stations: ["Hellerud", "Tveita", "Haugerud", "Trosterud", "Lindeberg", "Furuset", "Ellingsrudåsen"],
    points: [[1215, 570], [1280, 520], [1340, 455], [1390, 375], [1430, 295]]
  },
  {
    id: "mortensrud",
    lines: ["3"],
    stations: ["Hellerud", "Godlia", "Skøyenåsen", "Oppsal", "Ulsrud", "Bøler", "Bogerud", "Skullerud", "Mortensrud"],
    points: [[1215, 570], [1300, 635], [1360, 715], [1410, 805], [1445, 910], [1445, 1000]]
  }
];

export const lineColors = {
  "1": "#00a9e0",
  "2": "#f15a24",
  "3": "#9b5aa6",
  "4": "#00529b",
  "5": "#35a936"
};

export function pointAlongPolyline(points, ratio) {
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index][0] - points[index - 1][0];
    const dy = points[index][1] - points[index - 1][1];
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    total += length;
  }
  let target = Math.max(0, Math.min(1, ratio)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const part = lengths[index] ? target / lengths[index] : 0;
      const a = points[index];
      const b = points[index + 1];
      return {
        x: a[0] + (b[0] - a[0]) * part,
        y: a[1] + (b[1] - a[1]) * part,
        tx: b[0] - a[0],
        ty: b[1] - a[1]
      };
    }
    target -= lengths[index];
  }
  return { x: points[0][0], y: points[0][1], tx: 1, ty: 0 };
}

export function buildStationLayout() {
  const layout = new Map();
  for (const corridor of corridors) {
    corridor.stations.forEach((name, index) => {
      if (layout.has(name)) return;
      const ratio = corridor.stations.length === 1 ? 0 : index / (corridor.stations.length - 1);
      layout.set(name, { ...pointAlongPolyline(corridor.points, ratio), corridor: corridor.id });
    });
  }
  return layout;
}
