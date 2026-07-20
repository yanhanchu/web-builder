export interface PropDoc {
  name: string;
  required: boolean;
  type: string;
  defaultValue: string | null;
  description: string;
}

export interface ComponentDoc {
  id: string;
  componentName: string;
  filePath: string;
  importPath: string;
  description: string;
  props: PropDoc[];
}
