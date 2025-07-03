
# This script parses the AMPL options Markdown file and generates Java arrays for each section.
# Each array contains option name, full heading, and a short description for each option.
# Usage: python parse.py [path/to/options.md]

import re

def parse_options_md(md_path):
    with open(md_path, encoding="utf-8") as f:
        lines = f.readlines()

    section_maps = {}
    current_section = None
    collecting = False
    option_pattern = re.compile(r"^###\s+([a-zA-Z0-9_(), ]+)(?: \(default ([^)]*)\))?")

    for i, line in enumerate(lines):
        # Detect second-level heading
        if line.startswith("## "):
            current_section = line.strip().replace("## ", "")
            collecting = True
            if current_section not in section_maps:
                section_maps[current_section] = {}
            continue

        if not collecting or current_section is None:
            continue

        # Detect option entry
        m = option_pattern.match(line)
        if m:
            option_heading = line.strip().replace('### ', '')
            option_names = m.group(1).split(",")
            option_names = [name.strip().split(" ")[0] for name in option_names]
            # Description is the next non-empty line
            desc = ""
            for j in range(i+1, min(i+6, len(lines))):
                desc_line = lines[j].strip()
                if desc_line and not desc_line.startswith("###"):
                    desc = desc_line
                    break
            desc = desc.replace("\n", " ").replace("  ", " ")
            for name in option_names:
                # Map: option name -> [heading, description]
                section_maps[current_section][name] = [option_heading, desc]

    # Output as Java arrays, one per section, with three strings per option
    def java_escape(s):
        return s.replace('\\', r'\\').replace('"', r'\"')

    for section, option_map in section_maps.items():
        if not option_map:
            continue
        arr_name = section.lower().replace(" ", "_").replace("/", "_")
        print(f'    String[][] {arr_name} = {{')
        for name, arr in option_map.items():
            desc_short = arr[1].split(".")[0]
            name_esc = java_escape(name)
            heading_esc = java_escape(arr[0])
            desc_esc = java_escape(desc_short)
            print(f'        {{"{name_esc}", "{heading_esc}", "{desc_esc}"}},')
        print('    };')
        print()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        options_path = sys.argv[1]
    else:
        options_path = "options.md"
    parse_options_md(options_path)