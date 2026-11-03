import type { CustomProps } from '../tools/types';
import Annotator from './Annotator';
export default function EditPdf(p: CustomProps) { return <Annotator {...p} mode="edit" />; }
