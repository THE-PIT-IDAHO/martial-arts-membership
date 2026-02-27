"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
    __googlePlacesLoaded?: boolean;
    __googlePlacesCallbacks?: (() => void)[];
  }
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (parts: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
  }) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  autoCapitalize?: (v: string) => string;
}

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";

function loadGoogleScript(callback: () => void) {
  if (window.__googlePlacesLoaded && window.google?.maps?.places) {
    callback();
    return;
  }

  if (window.__googlePlacesCallbacks) {
    window.__googlePlacesCallbacks.push(callback);
    return;
  }

  window.__googlePlacesCallbacks = [callback];

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    window.__googlePlacesLoaded = true;
    const cbs = window.__googlePlacesCallbacks || [];
    window.__googlePlacesCallbacks = undefined;
    cbs.forEach((cb) => cb());
  };
  document.head.appendChild(script);
}

function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[]
): { address: string; city: string; state: string; zipCode: string } {
  let streetNumber = "";
  let route = "";
  let city = "";
  let state = "";
  let zipCode = "";

  for (const c of components) {
    const types = c.types;
    if (types.includes("street_number")) streetNumber = c.long_name;
    else if (types.includes("route")) route = c.long_name;
    else if (types.includes("locality")) city = c.long_name;
    else if (types.includes("sublocality_level_1") && !city) city = c.long_name;
    else if (types.includes("administrative_area_level_1")) state = c.short_name;
    else if (types.includes("postal_code")) zipCode = c.long_name;
  }

  const address = streetNumber ? `${streetNumber} ${route}` : route;
  return { address, city, state, zipCode };
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing an address...",
  required,
  className,
  autoCapitalize: autoCapFn,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!GOOGLE_API_KEY || !inputRef.current) return;

    loadGoogleScript(() => {
      if (!inputRef.current || !window.google?.maps?.places) return;

      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["address_components", "formatted_address"],
      });

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.address_components) return;

        const parts = parseAddressComponents(place.address_components);
        onAddressSelect(parts);
      });

      autocompleteRef.current = ac;
      setReady(true);
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const inputClass =
    className ||
    "w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => {
        const v = autoCapFn ? autoCapFn(e.target.value) : e.target.value;
        onChange(v);
      }}
      placeholder={ready ? placeholder : placeholder}
      required={required}
      className={inputClass}
      autoComplete="off"
    />
  );
}
