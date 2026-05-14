package channeltype

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAsyncTaskChannelTypes(t *testing.T) {
	assert.Equal(t, 57, ApiMart, "ApiMart channel type must be 57")
	assert.Equal(t, 58, Jimeng, "Jimeng channel type must be 58")
}
