/**
 * Catálogo por defecto de skills (competencias y stack). Se siembra de forma idempotente
 * (`ON CONFLICT (name) DO NOTHING`) tras aplicar las migraciones; las skills de dominio
 * (repos / épicas) las crea el recálculo, no este fichero.
 */

export interface SeedSkill {
  name: string;
  category: 'competency' | 'stack';
  description: string | null;
  sortOrder: number;
}

const COMPETENCIES: Array<[string, string]> = [
  [
    'Ejecución técnica',
    'Junior: cierra tareas acotadas con guía · Mid: entrega una feature completa solo · Senior: es dueño de un servicio y sus trade-offs',
  ],
  [
    'Calidad y review',
    'Junior: sigue la guía de estilo y arregla lo que le señalan · Mid: revisa PRs de otros detectando bugs y deuda · Senior: define el estándar de calidad y lo hace cumplir con criterio',
  ],
  [
    'Diseño y sistemas',
    'Junior: entiende el diseño que le dan · Mid: diseña un módulo con sus límites y contratos · Senior: diseña sistemas completos y anticipa su evolución',
  ],
  [
    'Encuadre del problema',
    'Junior: implementa lo que se le pide · Mid: cuestiona el requisito y propone alternativas · Senior: reformula el problema con negocio y elige qué no hacer',
  ],
  [
    'Autonomía',
    'Junior: necesita seguimiento diario · Mid: se desbloquea solo y pide ayuda a tiempo · Senior: lidera temas ambiguos de principio a fin sin supervisión',
  ],
  [
    'Colaboración y mentoría',
    'Junior: pide y recibe feedback · Mid: ayuda a compañeros y comparte contexto · Senior: hace crecer a otros y multiplica al equipo',
  ],
  [
    'Evaluar código generado por IA',
    'Junior: valida la salida antes de usarla · Mid: detecta cuándo la IA está confiadamente equivocada · Senior: define cómo el equipo usa y revisa código generado',
  ],
];

const STACK: string[] = [
  'Node/TypeScript',
  'SST / IaC',
  'DynamoDB',
  'Prisma / SQL',
  'Zod y validación',
  'Arquitectura hexagonal',
  'Testing (unit + integración)',
  'AWS Lambda / serverless',
  'CI/CD',
];

export const DEFAULT_SKILLS: SeedSkill[] = [
  ...COMPETENCIES.map(([name, description], i) => ({ name, category: 'competency' as const, description, sortOrder: i + 1 })),
  ...STACK.map((name, i) => ({ name, category: 'stack' as const, description: null, sortOrder: i + 1 })),
];
