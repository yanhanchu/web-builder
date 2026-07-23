import { Layout } from "@workspace/ui/components/landing1/layout";
import { PageIntro } from "@workspace/ui/components/landing1/page-intro";
import { SectionList } from "@workspace/ui/components/landing1/section-list";
import { header, footer, pageIntro, sectionList } from "@workspace/ui/components/landing1/default";

export default function AboutPage() {
  return (
    <Layout header={header} footer={footer}>
      <PageIntro {...pageIntro} />
      <div className="mx-auto max-w-3xl">
        <SectionList {...sectionList} />
      </div>
    </Layout>
  );
}
