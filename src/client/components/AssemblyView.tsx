import React from "react";
import type { AssemblyDocument } from "../../shared/assembly.js";
import { EngineeringEditorView } from "../editor/EngineeringEditorView.js";

export function AssemblyView({
  assembly,
  selectedComponentId,
  onSelectComponent,
  aiReferenceMeshUrl,
  aiReferenceArtifact,
  engineeringData,
}: {
  assembly: AssemblyDocument;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  aiReferenceMeshUrl?: string | null;
  aiReferenceArtifact?: any;
  engineeringData?: {
    fes?: any;
    upload?: (file: File) => void;
    loadSample?: () => void;
    validationReport?: any;
  };
}) {
  return (
    <EngineeringEditorView
      assembly={assembly}
      selectedComponentId={selectedComponentId}
      onSelectComponent={onSelectComponent}
      aiReferenceMeshUrl={aiReferenceMeshUrl}
      aiReferenceArtifact={aiReferenceArtifact}
      engineeringData={engineeringData}
    />
  );
}
