import { Layout } from "@workspace/ui/components/landing1/layout";
import { Hero } from "@workspace/ui/components/landing1/hero";
import { ValueProps } from "@workspace/ui/components/landing1/value-props";
import { CtaBanner } from "@workspace/ui/components/landing1/cta-banner";
import { header, footer, hero, valueProps, ctaBanner } from "@workspace/ui/components/landing1/default";

export default function HomePage() {
  return (
    <Layout header={header} footer={footer}>
      <Hero {...hero} />
      <ValueProps {...valueProps} />
      <CtaBanner {...ctaBanner} />
    </Layout>
  );
}
