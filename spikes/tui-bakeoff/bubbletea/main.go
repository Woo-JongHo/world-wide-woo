package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type event struct {
	Category string         `json:"category"`
	Title    string         `json:"title"`
	Body     string         `json:"body"`
	Status   string         `json:"status"`
	Metadata map[string]any `json:"metadata"`
}

type model struct {
	width, height int
	conversation  viewport.Model
	execution     viewport.Model
	events        []event
	focus         int
}

var (
	accent   = lipgloss.Color("39")
	muted    = lipgloss.Color("245")
	green    = lipgloss.Color("42")
	yellow   = lipgloss.Color("214")
	panel    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("238")).Padding(0, 1)
	title    = lipgloss.NewStyle().Bold(true).Foreground(accent)
	keyStyle = lipgloss.NewStyle().Foreground(muted)
)

func loadEvents(path string) ([]event, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []event
	s := bufio.NewScanner(f)
	for s.Scan() {
		var e event
		if err := json.Unmarshal(s.Bytes(), &e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, s.Err()
}

func initialModel(events []event) model {
	m := model{events: events, conversation: viewport.New(80, 7), execution: viewport.New(80, 9)}
	m.refresh()
	return m
}

func (m model) Init() tea.Cmd { return nil }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "tab":
			m.focus = (m.focus + 1) % 2
		}
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		w := max(36, msg.Width-4)
		m.conversation.Width, m.execution.Width = w-4, w-4
		available := max(10, msg.Height-18)
		m.conversation.Height = min(7, max(4, available/3))
		m.execution.Height = max(5, available-m.conversation.Height)
	}
	var cmd tea.Cmd
	if m.focus == 0 {
		m.conversation, cmd = m.conversation.Update(msg)
	} else {
		m.execution, cmd = m.execution.Update(msg)
	}
	return m, cmd
}

func (m *model) refresh() {
	var conversation, execution []string
	for _, e := range m.events {
		switch e.Category {
		case "user", "assistant":
			label := lipgloss.NewStyle().Bold(true).Foreground(accent).Render(e.Title)
			conversation = append(conversation, label+"  "+e.Body)
		case "command":
			cwd, _ := e.Metadata["cwd"].(string)
			execution = append(execution, title.Render("$ "+e.Title)+keyStyle.Render("  "+cwd), e.Body, lipgloss.NewStyle().Foreground(green).Render("✓ exit 0"), "")
		}
	}
	m.conversation.SetContent(strings.Join(conversation, "\n\n"))
	m.execution.SetContent(strings.Join(execution, "\n"))
}

func (m model) View() string {
	w := max(40, m.width-2)
	header := panel.Width(w - 4).Render(title.Render("WES Session") + "  " + keyStyle.Render("project 99_www  │  branch main  │  status prototype"))
	conversation := panel.Width(w - 4).Render(title.Render(focusMark(m.focus == 0)+" Conversation") + "\n" + m.conversation.View())
	execution := panel.Width(w - 4).Render(title.Render(focusMark(m.focus == 1)+" Live Execution") + "\n" + m.execution.View())
	var results []string
	for _, e := range m.events {
		if e.Category == "action" || e.Category == "decision" || e.Category == "evidence" {
			color := accent
			if e.Category == "decision" {
				color = yellow
			}
			if e.Category == "evidence" {
				color = green
			}
			results = append(results, lipgloss.NewStyle().Bold(true).Foreground(color).Width(10).Render(e.Title)+" "+e.Body)
		}
	}
	result := panel.Width(w - 4).Render(title.Render("Result") + "\n" + strings.Join(results, "\n"))
	composer := panel.Width(w - 4).Render(title.Render("> ") + keyStyle.Render("메시지 입력") + "\n" + keyStyle.Render("tab: pane  ↑/↓: scroll  q: quit"))
	return lipgloss.JoinVertical(lipgloss.Left, header, conversation, execution, result, composer)
}

func focusMark(active bool) string {
	if active {
		return "●"
	}
	return "○"
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	path := "../fixtures/session-events.jsonl"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	events, err := loadEvents(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if _, err := tea.NewProgram(initialModel(events), tea.WithAltScreen(), tea.WithMouseCellMotion()).Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
