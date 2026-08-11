import { ManualUploadForm } from "@/components/artifacts/manual-upload-form";

export default function ManualUploadPage() {
  return (
    <main>
      <h1>Manual Upload</h1>
      <p>Governed operator ingestion into immutable RawArtifact storage.</p>
      <ManualUploadForm />
    </main>
  );
}
