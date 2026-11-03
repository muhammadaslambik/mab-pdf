import type { CustomProps } from '../tools/types';
import Annotator from './Annotator';
export default function RedactPdf(p: CustomProps) { return <Annotator {...p} mode="redact" />; }
