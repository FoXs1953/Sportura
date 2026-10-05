import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Globe2, MapPin } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import "@/styles/city-select.css";

export function CitySelect({
  city,
  cities,
  onCityChange,
}: {
  city: string;
  cities: readonly string[];
  onCityChange: (city: string) => void;
}) {
  const { tr } = useI18n();
  const options = [
    ...new Set([...cities, ...(city === "all" ? [] : [city])]),
  ].filter((value) => value && value !== "all");

  return (
    <Select.Root value={city || "all"} onValueChange={onCityChange}>
      <Select.Trigger className="feed-city-trigger" aria-label={tr("Город")}>
        <MapPin size={18} aria-hidden="true" />
        <Select.Value>
          {city && city !== "all" ? tr(city) : tr("Все города")}
        </Select.Value>
        <Select.Icon className="feed-city-chevron">
          <ChevronDown size={16} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="feed-city-menu"
          position="popper"
          align="start"
          sideOffset={8}
          collisionPadding={16}
        >
          <Select.ScrollUpButton className="feed-city-scroll">
            <ChevronUp size={16} aria-hidden="true" />
          </Select.ScrollUpButton>
          <Select.Viewport className="feed-city-viewport">
            <Select.Group>
              <Select.Label className="feed-city-label">
                {tr("Город")}
              </Select.Label>
              <Select.Item className="feed-city-option" value="all">
                <Globe2 size={16} aria-hidden="true" />
                <Select.ItemText>{tr("Все города")}</Select.ItemText>
                <Select.ItemIndicator className="feed-city-check">
                  <Check size={16} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
              <Select.Separator className="feed-city-separator" />
              {options.map((value) => (
                <Select.Item
                  className="feed-city-option"
                  value={value}
                  key={value}
                >
                  <MapPin size={16} aria-hidden="true" />
                  <Select.ItemText>{tr(value)}</Select.ItemText>
                  <Select.ItemIndicator className="feed-city-check">
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Group>
          </Select.Viewport>
          <Select.ScrollDownButton className="feed-city-scroll">
            <ChevronDown size={16} aria-hidden="true" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
